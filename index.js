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
var nonPrivate = require('non-private-ip')

var DEFAULT_PORT = 2000

var Api       = require('./lib/api')
var manifest  = require('./lib/manifest')
var peerApi   = require('./lib/rpc')
var u         = require('./lib/util')
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

  var server = net.createServer(function (stream) {
    // setup and auth session
    var rpc = attachSession(stream, true)
    server.emit('log:info', ['sbot',  rpc._sessid, 'incoming-connection', stream.remoteAddress])
  })

  // peer connection
  // ===============

  // sets up RPC session on a stream (used by {in,out}going streams)

  function attachSession (stream, incoming, cb) {
    var rpc = peerApi(server.manifest, api)
                .permissions({allow: ['auth']})
    var rpcStream = rpc.createStream()
    rpcStream = inactive(rpcStream, server.config.timeout)
    pull(stream, rpcStream, stream)

    rpc.incoming = incoming
    rpc.outgoing = !incoming

    rpc._sessid = ++sessCounter
    rpc._remoteAddress = stream.remoteAddress
    rpc.task = multicb()
    server.emit('rpc:connect', rpc)
    server.emit('rpc:' + (incoming ? 'incoming' : 'outgoing'), rpc)

    rpc.on('remote:authorized', function (authed) {
      server.emit('remote:authorized', rpc, authed)
      server.emit('log:info', ['remote', rpc._sessid, 'remote-authed', authed])
      if(authed.type === 'client')
        rpcStream.setTTL(null) //don't abort the stream on timeout.
    })

    rpc.auth(ssbKeys.signObj(keys, {
      ToS: 'be excellent to each other',
      public: keys.public,
      ts: Date.now(),
    }), function (err, res) {

      if(err || !res) {
        server.emit('rpc:unauthorized', err)
        rpc._emit('rpc:unauthorized', err)
        server.emit('log:warning', ['sbot', rpc._sessid, 'unauthed', err])
        return
      }
      else {
        server.emit('rpc:authorized', rpc, res)
        rpc._emit('rpc:authorized', rpc, res)
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

  server.connect = function (address, cb) {
    var rpc = attachSession(net.connect(toAddress(address)), false, cb)
    server.emit('log:info', ['sbot', rpc._sessid, 'connect', address])
    return rpc
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

  server.permissions = {
    master: {allow: null, deny: null},
    local: {allow: [
      'getPublicKey',
      'whoami',
      'get',
      'getLatest',
      'add',
      'createFeedStream',
      'createHistoryStream',
      'createLogStream',
      'messagesByType',
      'messagesLinkedToMessage',
      'messagesLinkedToFeed',
      'messagesLinkedFromFeed',
      'feedsLinkedToFeed',
      'feedsLinkedFromFeed',
      'followedUsers',
      'relatedMessages'
    ], deny: null},
    anonymous: {allow: ['createHistoryStream'], deny: null}
  }
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
exports.fromConfig = function (config) {
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
      console.error('Error while rebuilding index', err)
      console.log('Stopping.')
      process.exit(1)
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
  }


  return sbot
}

exports.createClient = require('./client')

if(!module.parent) {
  //start a server
  exports.init(require('ssb-config'))
}
