var ws = require('pull-ws')
var WebSocket = require('ws')
var url = require('url')

exports.connect = function (addr) {
  var u = url.format({
    protocol: 'ws', slashes: true,
    hostname: addr.host,
    port: addr.port
  })
  var socket = new WebSocket(u)
  var stream = ws(socket)
  stream.socket = socket
  return stream
}

var EventEmitter = require('events').EventEmitter

exports.createServer = function (onConnection) {
  var emitter = new EventEmitter()
  var server
  if(onConnection)
    emitter.on('connection', onConnection)

  emitter.listen = function (addr, onListening) {
    if(onListening)
      emitter.once('listening', onListening)

    server = new WebSocket.Server({port: addr.port || addr})
      .on('listening', function () {
        emitter.emit('listening')
      })
      .on('connection', function (socket) {
        emitter.emit('connection', ws(socket))
      })
    return emitter
  }
  emitter.close = function () {
    if(!server) return
    server.close()
    emitter.emit('close')
    return emitter
  }
  return emitter
}
