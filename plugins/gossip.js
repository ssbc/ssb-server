'use strict'
var pull = require('pull-stream')
var Notify = require('pull-notify')
var toAddress = require('../lib/util').toAddress
var nonPrivate = require('non-private-ip')
var u = require('../lib/util')

var isArray = Array.isArray

function rand(array) {
  return array[~~(Math.random()*array.length)]
}

function add(ary, item) {
  if(!~ary.indexOf(item)) ary.push(item)
  return ary
}

module.exports = {
  name: 'gossip',
  version: '1.0.0',
  manifest: {
    seeds: 'async',
    peers: 'sync',
    connect: 'async',
    changes: 'source',
    add: 'sync'
  },
  init: function (server, config) {
    var notify = Notify()
    var conf = config.gossip || {}
    var home = u.toAddress(server.getAddress())

    // Peer Table
    // ==========

    //current list of known peers.
    var peers = []
    // ordered list of peers to sync with once at startup
    var init_synclist = []

    function getPeer(id) {
      return u.find(peers.filter(Boolean), function (e) {
        return e.key === id
      })
    }

    // RPC api
    // =======

    var gossip = {
      peers: function () {
        return peers
      },
      connect: function (addr, cb) {
        addr = u.toAddress(addr)
        if (!addr || typeof addr != 'object')
          return cb(new Error('first param must be an address'))

        if(!addr.key) return cb(new Error('address must have ed25519 key'))
        // add peer to the table, incase it isn't already.
        gossip.add(addr, 'manual')
        connect(addr, cb)
      },
      changes: function () {
        return notify.listen()
      },
      //add an address to the peer table.
      add: function (addr, source) {
        if(!addr) return

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
          peers.push(addr)
          notify({ type: 'discover', peer: addr, source: source || 'manual' })
          return true
        } else {
          // existing pub, update the announcers list
          if (!f.announcers)
            f.announcers = addr.announcers || []
          else if(addr.announcers && addr.announcers[0])
            add(f.announcers, addr.announcers[0])
          return false
        }
      }
    }

    // TODO: Move this to another plugin.
    // not really about gossip.
    // track connection-state in peertable
    // :TODO: need to update on rpc.on('closed') ?
    server.on('rpc:connect', function (rpc) {
      //************************************
      //TODO. DISTINGUISH CLIENT CONNECTIONS.

      var peer = getPeer(rpc.id)

      if (peer) {
        peer.id = rpc.id
        peer.connected = true

        notify({ type: 'connect', peer: peer })
        rpc.on('closed', function () {
          notify({ type: 'disconnect', peer: peer })
        })
      }
    })

    // populate peertable with configured seeds (mainly used in testing)
    var seeds = config.seeds
    seeds = (isArray(seeds)  ? seeds : [seeds])
    seeds.forEach(function (addr) { gossip.add(addr, 'seed') })

    // populate peertable with pub announcements on the feed
    pull(
      server.messagesByType({
        type: 'pub', live: true, keys: false, onSync: onFeedSync
      }),
      pull.drain(function (msg) {
        if(!msg.content.address) return
        var addr = toAddress(msg.content.address)
        addr.announcers = [msg.author] // track who has announced this pub addr
        gossip.add(addr, 'pub')
      })
    )

    function onFeedSync () {
      // create the initial synclist, ordered by # of announcers
      init_synclist = peers.slice()
      init_synclist.sort(function (a, b) {
        var al = (a.announcers) ? a.announcers.length : 5
        var bl = (b.announcers) ? b.announcers.length : 5
        return bl - al
      })
      init_synclist = init_synclist.slice(0, 50) // limit to top 50
      // kick off a connection
      immediate()
    }

    // populate peertable with announcements on the LAN multicast
    server.on('local', function (_peer) {
      gossip.add(_peer, 'local')
    })

    function createSchedule (min, max, job) {
      var sched
      server.once('close', function () { clearTimeout(sched) })
      return function schedule () {
        if(server.closed) return
        sched = setTimeout(job, min + (Math.random()*max))
        return schedule
      }
    }

    // Gossip
    // ======
    // create a new connection every so often.

    function immediate () {
      if(server.closed) return
      if(count < (conf.connections || 2)) schedule()
      var p = choosePeer(); p && connect(p, function () {})
    }

    var schedule = createSchedule(1e3, config.timeout || 2e3, immediate)()

  /*
    ideas:

      if long time since replicated then priority = high
      if syncing_complete and contacted_all_pubs then rereplicate
      if popular_pub and long_time_sincethen priority=high
      if posted_recently > connected_recently then priority=high
      if failed_recently then priority=low

  */

    var count = 0

    function choosePeer () {
      if(init_synclist.length) return init_synclist.shift()

      // connect to this random peer
      // choice is weighted...
      // - decrease odds due to failures
      // - increase odds due to multiple announcements
      // - if no announcements, it came from config seed or LAN, so given a higher-than-avg weight

      // for seeds and peers (with no failures, lim will be 0.75)
      var default_a = 5
      var p = rand(peers.filter(function (e) {
        var a = Math.min((e.announcers) ? e.announcers.length : default_a, 10) // cap at 10
        var f = e.failure || 0
        var lim = (a+10)/((f+1)*20)
        // this function increases linearly from 0.5 to 1 with # of announcements
        // ..and decreases by inversely with # of failures
        return !e.connected && (Math.random() < lim)
      }))

      return p

    }

    function connect (p, cb) {
      count ++
      p.time = p.time || {}
      if (!p.time.connect)
        p.time.connect = 0
      p.time.attempt = Date.now()
      p.connected = true

      server.connect(p, function (err, rpc) {
        if (err) {
          p.connected = false
          notify({ type: 'connect-failure', peer: p })
          server.emit('log:info', ['SBOT', p.host+':'+p.port+p.key, 'connection failed', err])
          return (cb && cb(err))
        }

        p.id = rpc.id
        p.time = p.time || {}
        p.time.connect = Date.now()

        rpc.on('closed', function () {
          //track whether we have successfully connected.
          count = Math.max(count - 1, 0)
          //or how many failures there have been.
          p.connected = false
          server.emit('log:info', ['SBOT', rpc._sessid, 'disconnect'])

          var fail = !p.time || (p.time.attempt > p.time.connect)

          if(fail) p.failure = (p.failure || 0) + 1
          else     p.failure = 0

          schedule()

          // :TODO: delete local peers if failure > N
        })
        cb && cb(null, rpc)
      })
    }

    return gossip
  }
}
