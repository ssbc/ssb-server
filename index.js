var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var path = require('path')
var opts = require('secure-scuttlebutt/defaults')
var create = require('secure-scuttlebutt/create')
var ssbKeys = require('ssb-keys')
var api = require('./lib/api')
var mkdirp = require('mkdirp')
var url = require('url')
var crypto = require('crypto')
var deepEqual = require('deep-equal')

opts.hmac = require('./lib/hmac')

var seal = require('./lib/seal')(opts)

var net = require('./ws')

function loadSSB (config) {
  var dbPath  = path.join(config.path, 'db')
  //load/create  secure scuttlebutt.
  return create(dbPath)
}

function loadKeys (config) {
  var keyPath = path.join(config.path, 'secret')
  return ssbKeys.loadOrCreateSync(keyPath)
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

  function attachRPC (stream, eventName) {
    var rpc = api.peer(server, config)
    var rpcStream = rpc.createStream()

    pull(stream, rpcStream, stream)

    // an api stream has been attached,
    // so now we need to call, say, the replication script
    // it needs the server, the api connection, and the stream (so it can close)

    // okay so maybe the approach is to implement the rpc server first
    // and then figure out the replication stuff?

    server.emit('rpc-connection', rpc, rpcStream)
    if(eventName) server.emit(eventName, rpc, rpcStream)
  }

  var server = net.createServer(function (socket) {
    attachRPC(socket, 'rpc-server')
  }).listen(config.port)

  server.ssb = ssb
  server.feed = feed
  server.config = config
  server.options = opts
  //peer connection...
  server.connect = function (address) {
    attachRPC(net.connect(address), 'rpc-client')
  }

  server.use = function (plugin) {
    plugin(server)
    return this
  }

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
      .use(require('./plugins/authorize'))
      .use(require('./plugins/replicate'))
      .use(require('./plugins/gossip'))
}

// connect to a peer as a client
// - `address.host`: string, hostname of the target
// - `address.port`: number, port of the target
/*<<<<<<< HEAD
exports.connect = function (address) {
  var stream = ws.connect(address)
  var rpc = api.client()
  rpc.socket = stream.socket
  pull(stream, rpc.createStream(), stream)
=======*/
exports.connect = function (address, cb) {
  var stream = net.connect(address, cb)
  var rpc = api.client()
  rpc.conn = rpc.createStream()
  rpc.close = rpc.conn.close
  pull(stream, rpc.conn, stream)
// >>>>>>> f387b5c785c72b4a49d72c124ccfa1af3e801593
  return rpc
}

if(!module.parent) {
  //start a server
  exports(require('./config'))
}
