
var broadcast = require('broadcast-stream')

function isFunction (f) {
  return 'function' === typeof f
}

module.exports = {
  name: 'local',
  version: '2.0.0',
  init: function (sbot, config) {

    var local = broadcast(config.port)

    local.on('data', function (buf) {
      if(buf.loopback) return

      var data = buf.toString()
      console.log(data)
      sbot.gossip.add(data, 'local')
    })

    setInterval(function () {
      // broadcast self
      // TODO: sign beacons, so that receipient can be confidant
      // that is really your id.
      // (which means they can update their peer table)
      // Oh if this includes your local address,
      // then it becomes unforgeable.
      console.log(server.getAddress())
      local.write(server.getAddress())
    }, 1000)
  }
}

