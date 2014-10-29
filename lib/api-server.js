var pull     = require('pull-stream')
var toPull   = require('stream-to-pull-stream')

module.exports = function(backend, rpcserver) {
  return function(conn) {
    var connStream = toPull.duplex(conn)
    pull(connStream, rpcserver(backend).createStream(), connStream)
  }
}