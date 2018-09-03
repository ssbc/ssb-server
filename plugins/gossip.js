'use strict'
var ConnectionManager = require('sbot-connection-manager')
var pull = require('pull-stream')
var Notify = require('pull-notify')
var mdm = require('mdmanifest')
var valid = require('../lib/validators')
// TODO: delete or make own connection-manager version
var apidoc = require('../lib/apidocs').gossip
var u = require('../lib/util')
var ref = require('ssb-ref')
var ping = require('pull-ping')
var stats = require('statistics')
var AtomicFile = require('atomic-file')
var path = require('path')
var deepEqual = require('deep-equal')

function isFunction (f) {
  return typeof f === 'function'
}

function stringify (peer) {
  return [peer.host, peer.port, peer.key].join(':')
}

function isObject (o) {
  return o && typeof o === 'object'
}

function toBase64 (s) {
  if (isString(s)) return s
  else s.toString('base64') // assume a buffer
}

function isString (s) {
  return typeof s === 'string'
}

function coerceAddress (address) {
  if (isObject(address)) {
    var protocol = 'net'
    if (address.host.endsWith('.onion')) { protocol = 'onion' }
    return [protocol, address.host, address.port].join(':') + '~' + ['shs', toBase64(address.key)].join(':')
  }
  return address
}

/*
Peers : [{
  key: id,
  host: ip,
  port: int,
  //to be backwards compatible with patchwork...
  announcers: {length: int}
  source: 'pub'|'manual'|'local'
}]
*/

module.exports = {
  name: 'gossip',
  version: '1.0.0',
  manifest: mdm.manifest(apidoc),
  permissions: {
    anonymous: {allow: ['ping']}
  },
  init: function (server, config) {
    var connectionManager = ConnectionManager({connectToPeer: function (address, cb) {
      server.connect(address.address, cb)
    }})

    // TODO: add start / stop scheduler to the pluging api. We want to be able to startup with scheduler stopped
    connectionManager.connections.start()

    var notify = Notify()

    var gossipJsonPath = path.join(config.path, 'gossip.json')
    var stateFile = AtomicFile(gossipJsonPath)
    var status = {}

    // Known Peers
    var peers = []

    function getPeer (id) {
      return u.find(peers, function (e) {
        return e && e.key === id
      })
    }

    function simplify (peer) {
      return {
        address: coerceAddress(peer),
        source: peer.source,
        state: peer.state,
        failure: peer.failure,
        client: peer.client,
        stats: {
          duration: peer.duration || undefined,
          rtt: peer.ping ? peer.ping.rtt : undefined,
          skew: peer.ping ? peer.ping.skew : undefined
        }
      }
    }

    server.status.hook(function (fn) {
    })

    server.close.hook(function (fn, args) {
      connectionManager.connections.stop()
      return fn.apply(this, args)
    })

    var timer_ping = 5 * 6e4

    var gossip = {
      wakeup: 0,
      peers: function () {
        return peers
      },
      connect: valid.async(function (addr, cb) {
        addr = ref.parseAddress(addr)
        console.log('something called connection manager connect.')
        connectionManager.addRoute(addr)
        // TODO: do immediate connect
        //
        cb()
      }, 'string|object'),

      disconnect: valid.async(function (addr, cb) {
        console.log('something called connection manager disconnect.')
        cb()
      }, 'string|object'),

      changes: function () {
        return notify.listen()
      },
      // add an address to the peer table.
      add: valid.sync(function (addr, source) {
        addr = ref.parseAddress(addr)
        if (!ref.isAddress(addr)) { throw new Error('not a valid address:' + JSON.stringify(addr)) }
        // check that this is a valid address, and not pointing at self.

        if (addr.key === server.id) return

        connectionManager.peer.addRoute({address: addr, isLocal: source === 'local'})
      }, 'string|object', 'string?'),

      remove: function (addr) {
        connectionManager.peer.removeRoute({address: addr})
      },

      ping: function (opts) {
        var timeout = config.timers && config.timers.ping || 5 * 60e3
        // between 10 seconds and 30 minutes, default 5 min
        timeout = Math.max(10e3, Math.min(timeout, 30 * 60e3))
        return ping({timeout: timeout})
      },
      reconnect: function () {
      },
      enable: valid.sync(function (type) {
        // enable gossip by type
      }, 'string?'),
      disable: valid.sync(function (type) {
        // disables gossip by type
      }, 'string?')
    }

    // get current state

    server.on('rpc:connect', function (rpc, isClient) {
      // if we're not ready, close this connection immediately
      if (!server.ready() && rpc.id !== server.id) return rpc.close()

      var peer = getPeer(rpc.id)
      // don't track clients that connect, but arn't considered peers.
      // maybe we should though?
      if (!peer) {
        if (rpc.id !== server.id) {
          server.emit('log:info', ['SBOT', rpc.id, 'Connected'])
          rpc.on('closed', function () {
            server.emit('log:info', ['SBOT', rpc.id, 'Disconnected'])
          })
        }
        return
      }

      status[rpc.id] = simplify(peer)

      server.emit('log:info', ['SBOT', stringify(peer), 'PEER JOINED'])
      // means that we have created this connection, not received it.
      peer.client = !!isClient
      peer.state = 'connected'
      peer.stateChange = Date.now()
      peer.disconnect = function (err, cb) {
        if (isFunction(err)) {
          cb = err
          err = null
        }
        rpc.close(err, cb)
      }

      if (isClient) {
        // default ping is 5 minutes...
        var pp = ping({serve: true, timeout: timer_ping}, function (_) {})
        peer.ping = {rtt: pp.rtt, skew: pp.skew}
        pull(
          pp,
          rpc.gossip.ping({timeout: timer_ping}, function (err) {
            if (err.name === 'TypeError') peer.ping.fail = true
          }),
          pp
        )
      }

      rpc.on('closed', function () {
        delete status[rpc.id]
        server.emit('log:info', ['SBOT', stringify(peer),
          ['DISCONNECTED. state was', peer.state, 'for',
            (new Date() - peer.stateChange) / 1000, 'seconds'].join(' ')])
        // track whether we have successfully connected.
        // or how many failures there have been.
        var since = peer.stateChange
        peer.stateChange = Date.now()
        //        if(peer.state === 'connected') //may be "disconnecting"
        peer.duration = stats(peer.duration, peer.stateChange - since)
        peer.state = undefined
        notify({ type: 'disconnect', peer: peer })
      })

      notify({ type: 'connect', peer: peer })
    })

    var last
    stateFile.get(function (err, ary) {
      last = ary || []
      if (Array.isArray(ary)) {
        ary.forEach(function (v) {
          delete v.state
          // don't add local peers (wait to rediscover)
          if (v.source !== 'local') {
            gossip.add(v, 'stored')
          }
        })
      }
    })

    var int = setInterval(function () {
      var copy = JSON.parse(JSON.stringify(peers))
      copy.filter(function (e) {
        return e.source !== 'local'
      }).forEach(function (e) {
        delete e.state
      })
      if (deepEqual(copy, last)) return
      last = copy
      // TODO: what to do with this?
      // stateFile.set(copy, function (err) {
      //  if (err) console.log(err)
      // })
    }, 10 * 1000)

    if (int.unref) int.unref()

    return gossip
  }

}
