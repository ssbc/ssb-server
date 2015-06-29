var net = require('net')
var toPull = require('stream-to-pull-stream')

exports.createServer = function (onConnect) {

  return net.createServer(function (stream) {
    onConnect(toPull.duplex(stream))
  })

}

exports.connect = function (addr) {
  return toPull.duplex(net.connect(addr.port, addr.host))
}
