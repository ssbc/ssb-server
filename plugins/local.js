
var broadcast = require('broadcast-stream')

function isFunction (f) {
  return 'function' === typeof f
}

module.exports = {
  name: 'local',
  version: '1.0.0',
  manifest: {
    get: 'async'
  },
  init: function (server) {

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
      var ts = Date.now()
      data.ts = ts
      var isNew = (data.id in peers)
      peers[data.id] = data

      if (!isNew)
        server.emit('log:info', ['local', null, 'discovered', data])
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

    return {
      get: function (cb, cb2) {
        if(isFunction(cb)) cb(null, peers)
        else if(isFunction(cb2)) cb2(null, peers)
        else return peers
      }
    }

  }

}

