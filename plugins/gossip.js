'use strict'
var pull = require('pull-stream')
var Notify = require('pull-notify')
var toAddress = require('../lib/util').toAddress
var nonPrivate = require('non-private-ip')
var mdm = require('mdmanifest')
var onWakeup = require('on-wakeup')
var valid = require('../lib/validators')
var apidoc = require('../lib/apidocs').gossip
var u = require('../lib/util')
var os = require('os')
var ip = require('ip')

var isArray = Array.isArray

function rand(array) {
  return array[~~(Math.random()*array.length)]
}

function add(ary, item) {
  if(!~ary.indexOf(item)) ary.push(item)
  return ary
}

//detect if not connected to wifi or other network
//(i.e. if there is only localhost)
function isOffline () {
  var lo = Object.keys(os.networkInterfaces())
  return lo.length === 1 && lo[0] === 'lo'
}

function createSchedule (min, max, job, server) {
  var sched
  server.once('close', function () { clearTimeout(sched) })
  return function schedule () {
    if(server.closed) return
    console.log('SCHED')
    sched = setTimeout(job, min + (Math.random()*max))
    return schedule
  }
}


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
  init: function (server, config) {
    var notify = Notify()
    var conf = config.gossip || {}
    var home = u.toAddress(server.getAddress())

    //Known Peers

    var peers = [], maxConnections = conf.connections || 2

    function getPeer(id) {
      return u.find(peers, function (e) {
        return e && e.key === id
      })
    }

    // RPC api
    // =======

    var gossip = {
      peers: function () {
        return peers
      },
      connect: valid.async(function (addr, cb) {
        addr = u.toAddress(addr)
        if (!addr || typeof addr != 'object')
          return cb(new Error('first param must be an address'))

        if(!addr.key) return cb(new Error('address must have ed25519 key'))
        // add peer to the table, incase it isn't already.
        gossip.add(addr, 'manual')
        // look up the peer
        var peer = u.find(peers, function (a) {
          return (
            addr.port === a.port
            && addr.host === a.host
            && addr.key === a.key
          )
        })
        connect(peer, cb)
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

        var f = u.find(peers, function (a) {
          return (
            addr.port === a.port
            && addr.host === a.host
            && addr.key === a.key
          )
        })
        if(!f) {
          // new peer
          addr.source = source
          peers.push(addr)
          notify({ type: 'discover', peer: addr, source: source || 'manual' })
          return true
        } else {
          // existing pub, update the announcers list
          if (!f.announcers)
            f.announcers = {length: 1}
          else if(f.source != 'local') //don't count local over and over
            f.announcers.length ++
          return false
        }
      }, 'string|object', 'string?')
    }

    // populate peertable with configured seeds (mainly used in testing)
    var seeds = config.seeds
    seeds = (isArray(seeds)  ? seeds : [seeds])
    seeds.filter(Boolean).forEach(function (addr) { gossip.add(addr, 'seed') })

    // populate peertable with pub announcements on the feed
    pull(
      server.messagesByType({
        type: 'pub', live: true, keys: false
      }),
      pull.drain(function (msg) {
        if(!msg.content.address) return
        var addr = toAddress(msg.content.address)
        //addr.announcers = [msg.author] // track who has announced this pub addr
        gossip.add(addr, 'pub')
      })
    )

    // populate peertable with announcements on the LAN multicast
    server.on('local', function (_peer) {
      gossip.add(_peer, 'local')
    })

    //get current state

    server.on('rpc:connect', function (rpc) {
      var peer = getPeer(rpc.id)

      if (peer) {
        console.log('connect', peer.host, peer.port, rpc.id)

        peer.connected = true
        peer.time = {connect: Date.now()}
        notify({ type: 'connect', peer: peer })
        rpc.on('closed', function () {
          //track whether we have successfully connected.
          //or how many failures there have been.
          peer.connected = false
          notify({ type: 'disconnect', peer: peer })
          server.emit('log:info', ['SBOT', rpc.id, 'disconnect'])

          if(count() < maxConnections) schedule()
        })
      }
    })

    function immediate () {
      if(server.closed) return
      connect(choosePeer(), function () {})
    }

    var schedule = createSchedule(
      1e3, config.timeout || 2e3, immediate, server
    )

    var n = maxConnections
    while(n--) schedule()

    // watch for machine sleeps, and syncAll if just waking up
    onWakeup(function () {
      console.log('Device wakeup detected, triggering pub sync')
      immediate()
    })

    function count () {
      return peers.reduce(function (acc, peer) {
        return acc + (peer.connected || peer.connecting)&1
      }, 0)
    }

    //select a random peer that we are not currently connect{ed,ing} to
    function choosePeer () {
      if(count() > maxConnections) return
      return rand(peers.filter(function (e) {
        //if we are offline, we can still connect to localhost.
        //without this, the tests will fail.
        if(isOffline() && (!ip.isLoopback(e.host) && e.host !== 'localhost'))
          return false

        return !(e.connected || e.connecting)
      }))
    }

    function connect (p, cb) {
      if(!p) return cb()
      p.time = p.time || {}
      if (!p.time.connect)
        p.time.connect = 0
      p.time.attempt = Date.now()
      p.connecting = true
      p.connected = false
      server.connect(p, function (err, rpc) {
        p.connecting = false
        if (err) {
          p.connected = false
          p.failure = (p.failure || 0) + 1
          notify({ type: 'connect-failure', peer: p })
          server.emit('log:info', ['SBOT', p.host+':'+p.port+p.key, 'connection failed', err.message || err])
          schedule()
          return (cb && cb(err))
        }
        cb && cb(null, rpc)
      })
    }

    return gossip
  }
}

