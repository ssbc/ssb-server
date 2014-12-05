

var broadcast = require('broadcast-stream')

module.exports = function (server) {

  var local = broadcast(server.config.port)

  var id = server.feed.id
  var peers = {}
  function toArray (o) {
    return Object.keys(o).map(function (k) { return o[k] })
  }

  local.on('data', function (buf) {
    if(buf.loopback) return

    var data = JSON.parse(buf.toString())
    data.host = buf.address
    data.ts = Date.now()
    peers[data.id] = data

    server.localPeers = toArray(peers)
    console.log('local', server.localPeers)
    server.emit('local', data)
  })

  setInterval(function () {
    // broadcast self
    local.write(JSON.stringify({id: id, port: server.config.port}))

    // clean out expired entries
    var ts = Date.now()
    for(var k in peers) {
      if(peers[k].ts + 3000 < ts)
        delete peers[k]
    }
    server.localPeers = toArray(peers)
  }, 1000)

}

if(!module.parent) {
  var emitter = new (require('events').EventEmitter)
  emitter.config = {port: 2000}
  emitter.feed = {id: 'noauroabker.test'}
  module.exports(emitter)
}
