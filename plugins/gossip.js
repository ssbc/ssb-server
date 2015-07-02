'use strict'
var pull = require('pull-stream')
var Notify = require('pull-notify')
var toAddress = require('../lib/util').toAddress
var nonPrivate = require('non-private-ip')
var u = require('../lib/util')

function all(stream, cb) {
  if (cb) return pull(stream, pull.collect(cb))
  else return function (cb) {
    pull(stream, pull.collect(cb))
  }
}

function isString(s) {
  return 'string' === typeof s
}

function isFunction (f) {
  return 'function' === typeof f
}

var isArray = Array.isArray

function isObject (o) {
  return o && 'object' === typeof o
}

function rand(array) {
  return array[~~(Math.random()*array.length)]
}

function sameHost(e) {
  return function (p) {
      return p.host == e.host && p.port == e.port
    }
}

module.exports = {
  name: 'gossip',
  version: '1.0.0',
  manifest: {
    seeds: 'async',
    peers: 'sync',
    connect: 'async',
    changes: 'source'
  },
  init: function (server) {
    var sched
    server.on('close', function () {
      server.closed = true
      clearTimeout(sched)
    })

    var notify = Notify()
    var config = server.config
    var conf = server.config.gossip || {}
    var host = config.host || nonPrivate.private() || 'localhost'
    var port = config.port

    // Peer Table
    // ==========

    //current list of known peers.
    var peers = []
    // ordered list of peers to sync with once at startup
    var init_synclist = []
    function getPeer(id) {
      return u.find(peers.filter(Boolean), function (e) {
        return e.id === id
      })
    }

    // track connection-state in peertable
    // :TODO: need to update on rpc.on('closed') ?
    server.on('rpc:connect', function (rpc) {
      //************************************
      //TODO. DISTINGUISH CLIENT CONNECTIONS.

      //don't track cli/web client connections
      if(rpc.auth.type === 'client') return

      var peer = rpc._peer
      if(!peer) //incomming connection...
        peer = getPeer(rpc.id)
      if(peer) {
        peer.id = rpc.id
        peer.connected = true
        setupEvents(rpc, peer)
      }
    })

    // populate peertable with configured seeds
    var seeds = config.seeds
    seeds = (isArray(seeds)  ? seeds : [seeds])
    seeds.forEach(function (e) {
      if(!e) return
      var p = toAddress(e)
      if(p && p.key) {
        peers.push(p)
        notify({ type: 'discover', peer: p, source: 'seed' })
      }
    })

    // populate peertable with pub announcements on the feed

    //TODO! pubs posts must contain public keys.
    pull(
      server.ssb.messagesByType({type: 'pub', live: true, keys: false, onSync: onFeedSync }),
      pull.map(function (e) {
        var o = toAddress(e.content.address)
        o.announcers = [e.author] // track who has announced this pub addr
        return o
      }),
      pull.filter(function (e) {
        // filter out announcements for this node
        if(e.port == port) {
          if(e.host == host) return false
          if(e.host == '127.0.0.1' || e.host == 'localhost') return false
        }
        if(!e.key) return false
        return true
      }),
      pull.drain(function (e) {
        var f = u.find(peers, sameHost(e))
        if(!f) {
          // new pub
          peers.push(e)
          notify({ type: 'discover', peer: e, source: 'pub' })
        } else {
          // existing pub, update the announcers list
          if (!f.announcers)
            f.announcers = e.announcers
          else if (f.announcers.indexOf(e.announcers[0]) === -1)
            f.announcers.push(e.announcers[0])
        }
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
      connect()
    }

    // populate peertable with announcements on the LAN multicast
    server.on('local', function (_peer) {
      var peer = getPeer(_peer.id)
      if(!peer) {
        notify({ type: 'discover', peer: peer, source: 'local' })
        peers.push(_peer)
      } else {
        // peer host could change while in use.
        // currently, there is a DoS vector here
        // (someone could falsely advertise your id,
        // but they could not steal they need private key)
        // since this is only over local network, it's not a big vector.
        peer.host = _peer.host
        peer.port = _peer.port
      }
    })

    // helper to emit and emit events for a connection
    function setupEvents (rpc, peer) {
      notify({ type: 'connect', peer: peer })
      rpc.on('closed', function () {
        notify({ type: 'disconnect', peer: peer })
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
        // find the peer
        var p = u.find(peers.filter(Boolean), function (e) {
          return e.host === addr.host && e.port === addr.port
        })
        if (!p) // only connect to known peers
          return cb(new Error('address not a known peer'))
        
        connectTo(p)
        cb()
      },
      changes: function () {
        return notify.listen()
      }
    }

    // Gossip
    // ======

    ;(function schedule() {
      if(server.closed) return
      var delay = ~~(config.timeout/2 + Math.random()*config.timeout)
      if (init_synclist)
        delay = ~~(Math.random()*1000) // dont wait long to poll, we're still in our initial sync
      sched = setTimeout(function () {
        schedule(); connect()
      }, delay)
    })()

    var count = 0

    function connect () {
      if(server.closed) return

      //two concurrent connections.
      if(count >= (conf.connections || 2)) return

      var p
      if (init_synclist) {
        // initial sync, take next in the ordered list
        p = init_synclist.shift()
        if (init_synclist.length === 0)
          init_synclist = null
      }
      else {
        // connect to this random peer
        // choice is weighted...
        // - decrease odds due to failures
        // - increase odds due to multiple announcements
        // - if no announcements, it came from config seed or LAN, so given a higher-than-avg weight
        var default_a = 5 // for seeds and peers (with no failures, lim will be 0.75)
        p = rand(peers.filter(function (e) {
          var a = Math.min((e.announcers) ? e.announcers.length : default_a, 10) // cap at 10
          var f = e.failure || 0
          var lim = (a+10)/((f+1)*20)
          // this function increases linearly from 0.5 to 1 with # of announcements
          // ..and decreases by inversely with # of failures
          return !e.connected && (Math.random() < lim)
        }))
      }

      if(p) {
        connectTo(p, function (err, rpc) {
          if(err) return console.error(err)
        })

      }
    }

    function connectTo (p, cb) {
      count ++
      p.time = p.time || {}
      if (!p.time.connect)
        p.time.connect = 0
      p.time.attempt = Date.now()
      p.connected = true

      server.connect(p, function (err, rpc) {
        if(err) return cb(err)

        rpc._peer = p
        p.id = rpc.id
        p.time = p.time || {}
        p.time.connect = Date.now()
        setupEvents(rpc, p)

        rpc.on('closed', function () {
          //track whether we have successfully connected.
          count = Math.max(count - 1, 0)
          //or how many failures there have been.
          p.connected = false
          server.emit('log:info', ['SBOT', rpc._sessid, 'disconnect'])

          var fail = !p.time || (p.time.attempt > p.time.connect)

          if(fail) p.failure = (p.failure || 0) + 1
          else     p.failure = 0

          // :TODO: delete local peers if failure > N
        })
        cb(null, rpc)
      })
    }

    return gossip
  }
}
