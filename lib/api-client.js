var net    = require('net')
var pull   = require('pull-stream')
var toPull = require('stream-to-pull-stream')

module.exports = function(port, host, rpcclient) {
  var conn = net.connect(port, host)
  var client = rpcclient()
  var clientStream = client.createStream()
  pull(clientStream, toPull.duplex(conn), clientStream)
  client.socket = conn
  return client
}