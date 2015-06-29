var fs         = require('fs')
var net        = require('./lib/net')
var pull       = require('pull-stream')
var path       = require('path')
var merge      = require('map-merge')
var create     = require('secure-scuttlebutt/create')
var mkdirp     = require('mkdirp')
var ssbKeys    = require('ssb-keys')
var multicb    = require('multicb')
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

var sessid = 0

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
    var id = pub.toString('base64')+'.ed25519'
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
    rpc.id = stream.remote.toString('base64')+'.ed25519'
    rpc.permissions(stream.auth)

    rpc._remoteAddress = stream.remoteAddress
    rpc._sessid = sessid++
    rpc.task = multicb()
    server.emit('rpc:connect', rpc)

    //TODO: put this stuff somewhere else...?

    //when the client connects (not a peer) we will be unable
    //to authorize with it. In this case, we shouldn't close
    //the connection...

    rpc.task(function () {
      //Actually, this does nothing!
      //removed this and all tests still passed...
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
        secure.auth = server.permissions.anonymous
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

  auth = createAuth(server)

  server.getId = function() {
    return server.feed.id
  }

  server.getAddress = function() {
    var host = server.config.host || nonPrivate.private() || 'localhost'
    //always provite the port.
    return host + ':' + server.config.port + ':'+server.feed.keys.public
  }

  var api = Api(server)

  // rpc session management
  // ======================
  var sessions = {}


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


  server.getManifest = function () {
    return server.manifest
  }

  return server
}

// load keys, ssb database, and create the server
// - `config.port`: number, port to serve on
// - `config.pass`: string, password for full admin access to the rpc api
// - `config.path`: string, the path to the directory which contains the keyfile and database

exports.init =
exports.fromConfig = require('./create')

exports.createClient = require('./client')

if(!module.parent) {
  //start a server
  exports.init(require('ssb-config'), function (err) {
    if(err) throw err
  })
}
