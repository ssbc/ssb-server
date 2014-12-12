var fs       = require('fs')
var net      = require('pull-ws-server')
var url      = require('url')
var pull     = require('pull-stream')
var path     = require('path')
var merge    = require('map-merge')
var create   = require('secure-scuttlebutt/create')
var mkdirp   = require('mkdirp')
var crypto   = require('crypto')
var ssbKeys  = require('ssb-keys')
var multicb  = require('multicb')
var inactive = require('pull-inactivity')

var DEFAULT_PORT = 2000

var Api      = require('./lib/api')
var manifest = require('./lib/manifest')
var peerApi  = require('./lib/rpc')
var clone    = require('./lib/util').clone

function loadSSB (config) {
  var dbPath  = path.join(config.path, 'db')
  //load/create  secure scuttlebutt.
  return create(dbPath)
}

function loadKeys (config) {
  var keyPath = path.join(config.path, 'secret')
  return ssbKeys.loadOrCreateSync(keyPath)
}

function isString (s) {
  return 'string' === typeof s
}

function isFunction (f) {
  return 'function' === typeof f
}

function find(ary, test) {
  for(var i in ary)
    if(test(ary[i], i, ary)) return ary[i]
}

// create the server with the given ssb and feed
// - `ssb`: object, the secure-scuttlebutt instance
// - `feed`: object, the ssb feed instance
// - `config.port`: number, port to serve on
// - `config.path`: string, the path to the directory which contains the keyfile and database
exports = module.exports = function (config, ssb, feed) {
  if(!config)
    throw new Error('must have config')

  if((!ssb || !feed) && !config.path)
    throw new Error('if ssb and feed are not provided, config must have path')

  if(config.path) mkdirp.sync(config.path)
  ssb = ssb || loadSSB(config)
  feed = feed || ssb.createFeed(loadKeys(config))
  var keys = feed.keys

  // server
  // ======

  // start listening
  var server = net.createServer(function (socket) {
    // setup and auth session
    var rpc = attachSession(socket, 'peer')
    server.emit('log:info', '[MAIN] RPC#'+rpc._sessid+' New incoming RPC connection') // :TODO: would be nice to log remoteAddress
  })

  if(config.port) server.listen(config.port)

  server.ssb = ssb
  server.feed = feed
  server.config = config
  server.options = ssbKeys
  server.manifest = merge({}, manifest)

  server.permissions = {
    master: {allow: null, deny: null},
    anonymous: {allow: ['createHistoryStream'], deny: null}
  }

  server.getId = function() {
    return server.feed.id
  }

  server.getAddress = function() {
    var address = server.config.hostname || server.config.host || 'localhost'
    if (server.config.port != DEFAULT_PORT)
      address += ':' + server.config.port
    return address
  }

  var api = Api(server)

  // peer connection
  // ===============

  server.connect = function (address, cb) {
    var rpc = attachSession(net.connect(address), 'client', cb)
    server.emit('log:info', ['sbot', rpc._sessid, 'connect', address])
    return rpc
  }

  // rpc session management
  // ======================
  var sessions = {}

  // sets up RPC session on a stream
  var sessCounter = 0
  function attachSession (stream, role, cb) {
    var rpc = peerApi(server.manifest, api)
                .permissions({allow: ['auth']})
    var rpcStream = rpc.createStream()
    rpcStream = inactive(rpcStream, server.config.timeout)
    pull(stream, rpcStream, stream)

    rpc._sessid = ++sessCounter
    rpc.task = multicb()
    server.emit('rpc:connect', rpc)
    if(role) server.emit('rpc:'+role, rpc)

    rpc.on('remote:authorized', function (authed) {
      console.log('remote connection', rpc.authorized, authed)
      if(authed.type === 'client')
        rpcStream.setTTL(null) //don't abort the stream on timeout.
    })

    rpc.auth(ssbKeys.signObj(keys, {
      role: role,
      ToS: 'be excellent to each other',
      public: keys.public,
      ts: Date.now(),
    }), function (err, res) {
      if(err) {
        server.emit('rpc:unauthorized', err)
        server.emit('log:warning', ['sbot', rpc._sessid, 'unauthed', err])
      }
      else {
        server.emit('rpc:authorized', rpc, res)
        server.emit('log:info', ['sbot', rpc._sessid, 'authed', res])
      }

      //TODO: put this stuff somewhere else...?

      //when the client connects (not a peer) we will be unable
      //to authorize with it. In this case, we shouldn't close
      //the connection...
      var n = 2
      function done () {
        if(--n) return
        server.emit('log:info', ['sbot', rpc._sessid, 'done'])
        rpc.close()
      }

      rpc.once('done', function () {
        server.emit('log:info', ['sbot', rpc._sessid, 'remote-done'])
        done()
      })

      rpc.task(function () {
        server.emit('log:info', ['sbot', rpc._sessid, 'local-done'])
        rpc.emit('done')
        done()
      })

      if (cb) cb(err, res)
    })

    return rpc
  }

  // authenticates the RPC stream
  function authSession (rpc, role, cb) {
  }

  // plugin management
  // =================

  server.use = function (plugin) {
    server.emit('log:info', ['sbot', null, 'use-plugin', plugin.name+'@'+plugin.version])
    if(isFunction(plugin)) plugin(server)
    else if(isString(plugin.name)) {
      server.manifest[plugin.name] = plugin.manifest
      if(plugin.permissions) {
        server.permissions = merge(
          server.permissions,
          clone(plugin.permissions, function (v) {
            return plugin.name + '.' + v
          }))
      }

      server[plugin.name] = api[plugin.name] = plugin.init(server)
    }
    return this
  }

  // auth management
  // ===============

  var secrets = []
  server.createAccessKey = function (perms) {
    perms = perms || {}
    var key = crypto.randomBytes(32)
    var ts = Date.now()
    var sec = {
      created: ts,
      expires: ts + (perms.ttl || 60*60*1000), //1 hour
      key: key,
      id: ssbKeys.hash(key),
      perms: perms
    }
    secrets.push(sec)
    return  sec.key
  }

  server.getManifest = function () {
    return server.manifest
  }

  server.authorize = function (msg) {
    var secret = find(secrets, function (e) {
      return e.id === msg.keyId
    })
    if(!secret) return
    return ssbKeys.verifyObjHmac(secret.key, msg)
  }

  return server
}

// load keys, ssb database, and create the server
// - `config.port`: number, port to serve on
// - `config.pass`: string, password for full admin access to the rpc api
// - `config.path`: string, the path to the directory which contains the keyfile and database

exports.init =
exports.fromConfig = function (config) {
  return module.exports(config)
      .use(require('./plugins/logging'))
      .use(require('./plugins/replicate'))
      .use(require('./plugins/gossip'))
      .use(require('./plugins/replicate'))
      .use(require('./plugins/local'))
      .use(require('./plugins/blobs'))
      .use(require('./plugins/invite'))
      .use(require('./plugins/friends'))
}

// createClient  to a peer as a client
// - `address.host`: string, hostname of the target
// - `address.port`: number, port of the target
exports.createClient = function (address, manf, cb) {

  manf = manf || manifest

  if(isFunction(manf))
    cb = manf, manf = manifest

  var stream = net.connect(address, cb)
  var rpc = peerApi(manf, {})
  pull(stream, rpc.createStream(), stream)
  return rpc
}

if(!module.parent) {
  //start a server
  exports.init(require('./config'))
}
