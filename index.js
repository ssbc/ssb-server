
var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var net = require('net')
var path = require('path')
var create = require('secure-scuttlebutt/create')
var ssbKeys = require('ssb-keys')
var api = require('./lib/api')

function loadSSB (config) {
  var dbPath  = path.join(config.path, 'db')
  //load/create  secure scuttlebutt.
  return create(dbPath)
}

function loadKeys (config) {
  var keyPath = path.join(config.path, 'secret')
  return ssbKeys.loadOrCreateSync(keyPath)
}

exports = module.exports = function (ssb, feed, config) {

  if(!config)
    throw new Error('must have config')

  function attachRPC (stream, eventName) {
    stream = toPull.duplex(stream)

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

  var server = net.createServer(function (stream) {
    attachRPC(stream, 'rpc-server')
  }).listen(config.port, function () {
    console.error('scuttlebot listening on:'+config.port)
  })

  server.ssb = ssb
  server.feed = feed
  server.config = config
  //peer connection...
  server.connect = function (address) {
    attachRPC(net.connect(address.port, address.host), 'rpc-client')
  }

  server.use = function (plugin) {
    plugin(server)
    return this
  }

  return server
}

exports.init = function (config) {
  var ssb  = loadSSB(config)
  var keys = loadKeys(config)
  var feed = ssb.createFeed(keys)

  return module.exports(ssb, feed, config)
      .use(require('./plugins/replicate'))
      .use(require('./plugins/gossip'))
}

if(!module.parent) {
  //start a server
  exports.init(require('./config'))
}
