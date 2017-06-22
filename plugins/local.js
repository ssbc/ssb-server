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
  init: function init (sbot, config) {
    if(config.gossip && config.gossip.local === false)
      return {
        init: function () {
          delete this.init
          init(sbot, config)
        }
      }

    var local = broadcast(config.port)
    var addrs = {}
    var lastSeen = {}

    // cleanup old local peers
    setInterval(function () {
      Object.keys(lastSeen).forEach((key) => {
        if (Date.now() - lastSeen[key] > 10e3) {
          sbot.gossip.remove(addrs[key])
          delete lastSeen[key]
        }
      })
    }, 5e3)

    // discover new local peers
    local.on('data', function (buf) {
      if (buf.loopback) return
      var data = buf.toString()
      var peer = ref.parseAddress(data)
      if (peer && peer.key !== sbot.id) {
        addrs[peer.key] = peer
        lastSeen[peer.key] = Date.now()
        sbot.gossip.add(data, 'local')
      }
    })

    // broadcast self
    setInterval(function () {
      if(config.gossip && config.gossip.local === false)
        return
      // TODO: sign beacons, so that receipient can be confidant
      // that is really your id.
      // (which means they can update their peer table)
      // Oh if this includes your local address,
      // then it becomes unforgeable.
      local.write(sbot.getAddress())
    }, 1000)
  }
}
