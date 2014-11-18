var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var net = require('net')
var path = require('path')
var create = require('secure-scuttlebutt/create')
var ssbKeys = require('ssb-keys')
var api = require('./lib/api')
var mkdirp = require('mkdirp')
var url = require('url')

//var WebSocket = require('ws')
//var ws = require('pull-ws')

var ws = require('./ws')

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

  if((!ssb || !feed) && !config.path)
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
      return { socket: stream.socket, rpc: rpc, rpcStream: rpcStream }
  }

  var server = ws.createServer(function (socket) {
    attachRPC(socket, 'rpc-server')
  }).listen(config.port)

  server.ssb = ssb
  server.feed = feed
  server.config = config
  //peer connection...
  server.connect = function (address, cb) {
    return attachRPC(ws.connect(address, cb), 'rpc-client')
  }
  server.gossip = require('./lib/gossip')
  server.downloadFeeds = require('./lib/download-feeds')


  return server
}

// connect to a peer as a client
// - `address.host`: string, hostname of the target
// - `address.port`: number, port of the target
// - `cb`: optional function, called on channel-open
exports.connect = function (address, cb) {
  var stream = ws.connect(address, cb)
  var rpc = api.client()
  var rpcStream = rpc.createStream()
  pull(stream, rpcStream, stream)
  return { socket: stream.socket, rpc: rpc, rpcStream: rpcStream }
}

if(!module.parent) {
  //start a server
  exports(require('./config'))
}
