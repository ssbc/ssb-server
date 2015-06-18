var fs         = require('fs')
var net        = require('pull-ws-server')
var url        = require('url')
var pull       = require('pull-stream')
var path       = require('path')
var merge      = require('map-merge')
var create     = require('secure-scuttlebutt/create')
var mkdirp     = require('mkdirp')
var crypto     = require('crypto')
var ssbKeys    = require('ssb-keys')
var multicb    = require('multicb')
var connect    = require('connect')
var inactive   = require('pull-inactivity')
var handshake  = require('secret-handshake')
var nonPrivate = require('non-private-ip')

var DEFAULT_PORT = 8008

var Api        = require('./lib/api')
var manifest   = require('./lib/manifest')
var peerApi    = require('./lib/rpc')
var u          = require('./lib/util')
var ssbCap     = require('./lib/ssb-cap')
var createAuth = require('./lib/auth')

var clone     = u.clone
var toAddress = u.toAddress

//I made this global so that when you run tests with multiple
//servers each connection gets it's own id..
var sessCounter = 0

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

function toBuffer(base64) {
  return new Buffer(base64.substring(0, base64.indexOf('.')), 'base64')
}

function toSodiumKeys (keys) {
  return {
    publicKey: toBuffer(keys.public),
    secretKey: toBuffer(keys.private)
  }
}

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

  var auth;

  var createServerStream = handshake.server(toSodiumKeys(keys), function (pub, cb) {
    //CONVERT to SSB format. (fix this so it's just an ed25519)
    var id = ssbKeys.hash(pub.toString('base64')+'.ed25519')
    console.log('ID', id)
    auth(id, cb)
  }, ssbCap)

  var server = net.createServer(function (stream) {
    // setup and auth session
    pull(
      stream,
      createServerStream(function (err, secure) {
        //drop the stream if a client fails to authenticate.
        if(err) return console.error(err.stack)
        secure.remoteAddress = stream.remoteAddress
        attachSession(secure, true)
      }),
      stream
    )
  })

  // peer connection
  // ===============

  // sets up RPC session on a stream (used by {in,out}going streams)

  function attachSession (stream, incoming) {
    var rpc = peerApi(server.manifest, api)
    var timeout = server.config.timeout || 30e3
    var rpcStream = rpc.createStream()
    rpcStream = inactive(rpcStream, timeout)

    pull(
      stream,
      rpcStream,
      stream
    )

    //CONVERT to SSB format. (fix this so it's just an ed25519)
    rpc.id = ssbKeys.hash(stream.remote.toString('base64')+'.ed25519')
    console.log(rpc.id)
    console.log('PERMS', stream.auth)
    rpc.permissions(stream.auth)

    rpc._sessid = ++sessCounter
    rpc._remoteAddress = stream.remoteAddress

    rpc.task = multicb()
    server.emit('rpc:connect', rpc)

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

    return rpc
  }

  var createClientStream = handshake.client(toSodiumKeys(keys), ssbCap)

  server.connect = function (address, cb) {
    var stream = net.connect(toAddress(address))
    pull(
      stream,
      createClientStream(toBuffer(address.key), function (err, secure) {
        if(err) return console.error(err.stack), cb(err)
        secure.remoteAddress = stream.remoteAddress
        secure.auth = createAuth.permissions.anonymous
        var rpc = attachSession(secure, false)
        server.emit('log:info', ['sbot', rpc._sessid, 'connect', address])
        cb(null, rpc)
      }),
      stream
    )
  }

  if(config.port)
    server.listen(config.port, function () {
      server.emit('log:info', ['sbot', null, 'listening', server.getAddress()])
    })

  server.ssb = ssb
  server.feed = feed
  server.config = config
  server.options = ssbKeys
  server.manifest = merge({}, manifest)

  auth = createAuth(server)

  server.getId = function() {
    return server.feed.id
  }

  server.getAddress = function() {
    var address = server.config.host || nonPrivate.private() || 'localhost'
    if (server.config.port != DEFAULT_PORT)
      address += ':' + server.config.port
    return address
  }

  var api = Api(server)

  // rpc session management
  // ======================
  var sessions = {}


  // http interface (via connect)
  // ============================
  //
  // http should be considered a legacy interface,
  // but we need it to work around various legacy
  // browser things. You should build most of your
  // app with the rpc api and not the http api.

  server.http = connect()
  server.on('request', server.http)

  //default handlers

  function stringManifest () {
    return JSON.stringify(server.getManifest(), null, 2) + '\n'
  }

  server.http.use(function (req, res, next) {
    if(req.url == '/manifest.json')
      res.end(stringManifest())
    //return manifest as JS GLOBAL,
    //so that it can be easily loaded into plugins, without hardcoding.
    else if(req.url == '/manifest.js')
      res.end(';SSB_MANIFEST = ' + stringManifest())
    else
      next()
  })

  // plugin management
  // =================

  server.use = function (plugin) {
    server.emit('log:info', [
      'sbot', null, 'use-plugin',
      plugin.name + (plugin.version ? '@'+plugin.version : '')
    ])
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

  server.getAccessKey = function (id) {
    return find(secrets, function (e) {
      return e.id === id
    })
  }

  server.getManifest = function () {
    return server.manifest
  }

  server.authorize = function (msg) {
    var secret = this.getAccessKey(msg.keyId)
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
exports.fromConfig = function (config, cb) {
  var sbot = module.exports(config)

  var rebuild = false
  sbot.ssb.needsRebuild(function (err, b) {
    if (b) {
      rebuild = true
      console.log('Rebuilding indexes to ensure consistency. Please wait...')
      sbot.ssb.rebuildIndex(setup)
    } else
      setup()
  })

  function setup (err) {
    if (err) {
      return cb(explain(err, 'error while rebuilding index'))
    }
    if (rebuild)
      console.log('Indexes rebuilt.')

    sbot
      .use(require('./plugins/logging'))
      .use(require('./plugins/replicate'))
      .use(require('./plugins/gossip'))
      .use(require('./plugins/blobs'))
      .use(require('./plugins/invite'))
      .use(require('./plugins/friends'))

    if (config.local)
      sbot.use(require('./plugins/local'))
    if (config.phoenix)
      sbot.use(require('ssbplug-phoenix'))

    cb(null, sbot)
  }


  return sbot
}

exports.createClient = require('./client')

if(!module.parent) {
  //start a server
  exports.init(require('ssb-config'))
}
