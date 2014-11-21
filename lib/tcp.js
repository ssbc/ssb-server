var net = require('net')
var toPull = require('stream-to-pull-stream')

exports.connect = function (addr, cb) {
  console.log('connect', addr)
  return toPull.duplex(net.connect(addr), cb)
}

var EventEmitter = require('events').EventEmitter

//***********************
// DOES NOT WORK YET - FOR SOME REASON?
//**********************

exports.createServer = function (onConnection) {
  var emitter = new EventEmitter()
  var server
  if(onConnection)
    emitter.on('connection', onConnection)

  server = net.createServer()
    .on('listening', function () {
      emitter.emit('listening')
    })
    .on('connection', function (socket) {
      emitter.emit('connection', toPull.duplex(socket))
    })

  emitter.listen = function (addr, onListening) {
    console.log('listen', addr)
    if(onListening)
      emitter.once('listening', onListening)

    server.listen(addr.port)
    return emitter
  }
  emitter.close = function (onClose) {
    if(!server) return onClose()
    server.close(onClose)
    return emitter
  }
  return emitter
}
