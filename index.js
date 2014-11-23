var cuid = require('cuid');
var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var path = require('path')
var opts = require('ssb-keys')
var create = require('secure-scuttlebutt/create')
var api = require('./lib/api')
var mkdirp = require('mkdirp')
var url = require('url')
var crypto = require('crypto')
var deepEqual = require('deep-equal')

var seal = require('./lib/seal')(opts)

var net = require('pull-ws-server')

function loadSSB (config) {
  var dbPath  = path.join(config.path, 'db')
  //load/create  secure scuttlebutt.
  return create(dbPath)
}

function loadKeys (config) {
  var keyPath = path.join(config.path, 'secret')
  return opts.loadOrCreateSync(keyPath)
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
    authSession(rpc, 'peer')
  }).listen(config.port)

  server.ssb = ssb
  server.feed = feed
  server.config = config
  server.options = opts

  // peer connection
  // ===============

  server.connect = function (address, cb) {
    return attachSession(net.connect(address, cb), 'client')
  }
  server.authconnect = function (address, cb) {
    var rpc = attachSession(net.connect(address), 'client')
    authSession(rpc, 'client', cb)
    return rpc
  }

  // rpc session management
  // ======================
  var sessions = {}

  // sets up RPC session on a stream
  function attachSession (stream, role) {
    var rpc = api.peer(server, config)
    var rpcStream = rpc.createStream()
    pull(stream, rpcStream, stream)

    // begin tracking the rpc session's lifecycle
    rpc._id = cuid()
    sessions[rpc._id] = {
      rpc: rpc, 
      jobs: {},
      timeout: 0,
      timer: null
    }

    server.emit('rpc:connect', rpc, rpcStream)
    if(role) server.emit('rpc:'+role, rpc, rpcStream)
    return rpc
  }

  // authenticates the RPC stream
  function authSession (rpc, role, cb) {
    rpc.auth(seal.sign(keys, {
      role: role,
      ToS: 'be excellent to each other',
      public: keys.public,
      ts: Date.now(),
    }), function (err, res) {
      if(err) rpc._emit('unauthorized', err)
      else    rpc._emit('authorized', res)
      if (cb) cb(err, res)
    })
  }

  // closes and destroys the session
  function cleanupSession(id) {
    var session = sessions[id]
    if (!session)
      return
    clearTimeout(session.timer)
    console.log('cleanup session: close')
    console.log('remaining jobs', session.jobs)
    session.rpc.close(function(){
      // :TODO: this is temporary, 'close' should be emitted by muxrpc
      session.rpc._emit('close')
    })

    delete sessions[id]
  }

  // plugin management
  // =================

  server.use = function (plugin) {
    plugin(server)
    return this
  }

  server.schedule = function(sessId, label, seconds, cb) {
    if (sessId._id)
      sessId = sessId._id
    var session = sessions[sessId]
    if (!session)
      return cb(new Error('Session no longer active'))

    // add the job
    var jobId = cuid()
    session.jobs[jobId] = label

    // extend session life as needed
    var needed = Date.now() + seconds*1000
    if (needed > session.timeout) {
      session.timeout = needed
      clearTimeout(session.timer)
      session.timer = setTimeout(cleanupSession.bind(null, sessId), seconds*1000)
    }

    // run the job
    cb(null, function() {
      delete session.jobs[jobId]

      // any jobs left?
      if (Object.keys(session.jobs).length === 0) {
        // close session
        cleanupSession(sessId)
      }
    })
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
      id: opts.hash(key),
      perms: perms
    }
    secrets.push(sec)
    return  sec.key
  }

  server.authorize = function (msg) {
    var secret = find(secrets, function (e) {
      return deepEqual(e.id, msg.keyId)
    })
    if(!secret) return
    return seal.verifyHmac(secret.key, msg)
  }

  return server
}

// load keys, ssb database, and create the server
// - `config.port`: number, port to serve on
// - `config.pass`: string, password for full admin access to the rpc api
// - `config.path`: string, the path to the directory which contains the keyfile and database
exports.init =
exports.fromConfig = function (config) {
  return module.exports(ssb)
      .use(require('./plugins/replicate'))
      .use(require('./plugins/gossip'))
      .use(require('./plugins/local'))
}

// createClient  to a peer as a client
// - `address.host`: string, hostname of the target
// - `address.port`: number, port of the target
exports.createClient = function (address, cb) {
  var stream = net.connect(address, cb)
  var rpc = api.client()
  pull(stream, rpc.createStream(), stream)
  return rpc
}

if(!module.parent) {
  //start a server
  exports(require('./config'))
    .use(require('./plugins/gossip'))
    .use(require('./plugins/replicate'))
    .use(require('./plugins/local'))
}
