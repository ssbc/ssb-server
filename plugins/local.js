var broadcast = require('broadcast-stream')
var ref = require('ssb-ref')
var ma = require('multiserver-address')
// local plugin
// broadcasts the address:port:pubkey triple of the sbot server
// on the LAN, using multicast UDP

function isFunction (f) {
  return 'function' === typeof f
}

function isEmpty (o) {
  for(var k in o)
    return false
  return true
}

/*
  idea: instead of broadcasting constantly,
  broadcast at startup, or when ip address changes (change networks)
  or when you receive a boardcast.

  this should use network more efficiently.
*/

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
      var peer = ma.decode(data)
      if (peer && peer.key !== sbot.id) {
        addrs[peer.key] = peer
        lastSeen[peer.key] = Date.now()
        //note: add the raw data, not the parsed data.
        //so we still have the whole address, including protocol (eg, websockets)
        sbot.gossip.add(data, 'local')
      }
    })

    sbot.status.hook(function (fn) {
      var _status = fn()
      if(!isEmpty(addrs)) {
        _status.local = {}
        for(var k in addrs)
          _status.local[k] = {address: addrs[k], seen: lastSeen[k]}
      }
      return _status
    })

    setImmediate(function () {
      // broadcast self
      var int = setInterval(function () {
        if(config.gossip && config.gossip.local === false)
          return
        // TODO: sign beacons, so that receipient can be confidant
        // that is really your id.
        // (which means they can update their peer table)
        // Oh if this includes your local address,
        // then it becomes unforgeable.
        var addr = sbot.getAddress('private') || sbot.getAddress('local')
        if(addr) local.write(addr)
      }, 1000)
      if(int.unref) int.unref()
    })
  }
}

