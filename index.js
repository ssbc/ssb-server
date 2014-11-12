var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var net = require('net')
var path = require('path')
var create = require('secure-scuttlebutt/create')
var ssbKeys = require('ssb-keys')
var api = require('./lib/api')
var mkdirp = require('mkdirp')
var url = require('url')

var WebSocket = require('ws')
var ws = require('pull-ws')

function loadSSB (config) {
  var dbPath  = path.join(config.path, 'db')
  //load/create  secure scuttlebutt.
  return create(dbPath)
}

function loadKeys (config) {
  var keyPath = path.join(config.path, 'secret')
  return ssbKeys.loadOrCreateSync(keyPath)
}


// create the server with the given ssb and feed
// - `ssb`: object, the secure-scuttlebutt instance
// - `feed`: object, the ssb feed instance
// - `config.port`: number, port to serve on
// - `config.pass`: string, password for full admin access to the rpc api
// - `config.path`: string, the path to the directory which contains the keyfile and database
exports = module.exports = function (config, ssb, feed) {

  if(!config)
    throw new Error('must have config')

  if((!ssb || !feed) && !!config.path)
    throw new Error('if ssb and feed are not provided, config must have path')

  if(config.path) mkdirp.sync(config.path)
  ssb = ssb || loadSSB(config)
  feed = feed || ssb.createFeed(loadKeys(config))

  function attachRPC (stream, eventName) {
    var rpc = api.peer(ssb, feed, config)
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

  var server = new WebSocket.Server({port: config.port})
    .on('connection', function (socket) {
    attachRPC(ws(socket), 'rpc-server')
  })

  server.ssb = ssb
  server.feed = feed
  server.config = config
  //peer connection...
  server.connect = function (address) {
    var u = url.format({
      protocol: 'ws', slashes: true,
      hostname: address.host,
      port: address.port
    })
    attachRPC(ws(new WebSocket(u)), 'rpc-client')
  }

  server.use = function (plugin) {
    plugin(server)
    return this
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
}

// connect to a peer as a client
// - `address.host`: string, hostname of the target
// - `address.port`: number, port of the target
exports.connect = function (address) {
  var conn = net.connect(address.port, address.host)
  var rpc = api.client()
  rpc.conn = conn
  stream = toPull.duplex(conn)
  pull(stream, rpc.createStream(), stream)
  return rpc
}

if(!module.parent) {
  //start a server
  exports(require('./config'))
}
