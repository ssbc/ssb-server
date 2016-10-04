var broadcast = require('broadcast-stream')
var ref = require('ssb-ref')
// local plugin
// broadcasts the address:port:pubkey triple of the sbot server
// on the LAN, using multicast UDP

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
      if(ref.parseAddress(data))
        sbot.gossip.add(data, 'local')
    })

    setInterval(function () {
      // broadcast self
      // TODO: sign beacons, so that receipient can be confidant
      // that is really your id.
      // (which means they can update their peer table)
      // Oh if this includes your local address,
      // then it becomes unforgeable.
      local.write(sbot.getAddress())
    }, 1000)
  }
}



