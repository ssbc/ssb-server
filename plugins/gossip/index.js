'use strict'
var pull = require('pull-stream')
var Notify = require('pull-notify')
var toAddress = require('../../lib/util').toAddress
var mdm = require('mdmanifest')
var valid = require('../../lib/validators')
var apidoc = require('../../lib/apidocs').gossip
var u = require('../../lib/util')
var ping = require('pull-ping')
var Stats = require('statistics')
var isArray = Array.isArray
var Schedule = require('./schedule')
var Init = require('./init')

/*
Peers : [{
  key: id,
  host: ip,
  port: int,
  time: {
    connect: ts,
  },
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
    var notify = Notify()
    var conf = config.gossip || {}
    var home = u.toAddress(server.getAddress())

    //Known Peers
    var peers = []

    function getPeer(id) {
      return u.find(peers, function (e) {
        return e && e.key === id
      })
    }

    var timer_ping = 5*6e4

    var gossip = {
      peers: function () {
        return peers
      },
      get: function (addr) {
        addr = u.toAddress(addr)
        return u.find(peers, function (a) {
          return (
            addr.port === a.port
            && addr.host === a.host
            && addr.key === a.key
          )
        })
      },
      connect: valid.async(function (addr, cb) {
        addr = u.toAddress(addr)
        if (!addr || typeof addr != 'object')
          return cb(new Error('first param must be an address'))

        if(!addr.key) return cb(new Error('address must have ed25519 key'))
        // add peer to the table, incase it isn't already.
        gossip.add(addr, 'manual')
        var p = gossip.get(addr)
        if(!p) return cb()

        p.time = p.time || {}
        p.stateChange = p.time.attempt = Date.now()
        p.state = 'connecting'
        server.connect(p, function (err, rpc) {
          if (err) {
            p.active = false
            p.state = undefined
            p.failure = (p.failure || 0) + 1
            p.stateChange = p.time.hangup = Date.now()
            notify({ type: 'connect-failure', peer: p })
            server.emit('log:info', ['SBOT', p.host+':'+p.port+p.key, 'connection failed', err.message || err])
            p.duration.value(0)
            return (cb && cb(err))
          }
          else {
            p.state = 'connected'
            p.active = true
            p.failure = 0
          }
          cb && cb(null, rpc)
        })

      }, 'string|object'),

      changes: function () {
        return notify.listen()
      },
      //add an address to the peer table.
      add: valid.sync(function (addr, source) {
        addr = u.toAddress(addr)
        if(!u.isAddress(addr))
          throw new Error('not a valid address:' + JSON.stringify(addr))
        // check that this is a valid address, and not pointing at self.

        if(addr.key === home.key) return
        if(addr.host === home.host && addr.port === home.port) return

        var f = gossip.get(addr)

        if(!f) {
          // new peer
          addr.source = source
          addr.announcers = 1
          addr.duration = Stats()
          peers.push(addr)
          notify({ type: 'discover', peer: addr, source: source || 'manual' })
          return addr
        }
        //don't count local over and over
        else if(f.source != 'local')
          f.announcers ++

        return f
      }, 'string|object', 'string?'),
      ping: function (opts) {
        var timeout = config.timers && config.timers.ping || 5*60e3
        //between 10 seconds and 30 minutes, default 5 min
        timeout = Math.max(10e3, Math.min(timeout, 30*60e3))
        return ping({timeout: timeout})
      }
    }

    Schedule (gossip, config, server)
    Init (gossip, config, server)
    //get current state

    server.on('rpc:connect', function (rpc, isClient) {
      var peer = getPeer(rpc.id)
      //don't track clients that connect, but arn't considered peers.
      //maybe we should though?
      if(!peer) return
      //means that we have created this connection, not received it.
      peer.client = !!isClient
      peer.state = 'connected'
      peer.time = peer.time || {}
      peer.stateChange = peer.time.connect = Date.now()

      if(isClient) {
        //default ping is 5 minutes...
        var pp = ping({serve: true, timeout: timer_ping}, function (_) {})
        peer.ping = {rtt: pp.rtt, skew: pp.skew}
        pull(
          pp,
          rpc.gossip.ping({timeout: timer_ping}, function (err) {
            if(err.name === 'TypeError') peer.ping.fail = true
          }),
          pp
        )
      }

      rpc.on('closed', function () {
        //track whether we have successfully connected.
        //or how many failures there have been.
        peer.stateChange = peer.time.hangup = Date.now()
        peer.duration.value(peer.time.hangup - peer.time.connect)
        peer.state = undefined
        notify({ type: 'disconnect', peer: peer })
        server.emit('log:info', ['SBOT', rpc.id, 'disconnect'])
      })

      notify({ type: 'connect', peer: peer })
    })

    return gossip
  }
}

// what does patchwork use?

// .time.connect
// .time.attempt (to count how many pubs you are on)
// .host (to check if this is is on the lan - instead use .source===local)
// .announcers (for sorting; change to sorting by last connect)
// .key (to check if this peer follows you) 
// .connected (to see if currently connected)






