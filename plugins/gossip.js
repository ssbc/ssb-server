'use strict'
var pull = require('pull-stream')
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
    connect: 'async'
  },
  init: function (server) {
    var sched
    server.on('close', function () {
      server.closed = true
      clearTimeout(sched)
    })

    var config = server.config
    var conf = server.config.gossip || {}

    //current list of known peers.
    var peers = []
    var seeds = config.seeds
    seeds =
      (isArray(seeds)  ? seeds : [seeds])

    seeds.forEach(function (e) {
      if(!e) return
      var p = toAddress(e)
      if(p) peers.push(p)
    })


    function get(id) {
      return u.find(peers.filter(Boolean), function (e) {
        return e.id === id
      })
    }

    var gossip = {
      peers: function () {
        return peers
      },
      connect: function (addr, cb) {
        addr = u.toAddress(addr)
        if (!addr || typeof addr != 'object')
          return cb(new Error('first param must be an address'))

        // find the peer
        var p = u.find(peers.filter(Boolean), function (e) {
          return e.host === addr.host && e.port === addr.port
        })
        if (!p) // only connect to known peers
          return cb(new Error('address not a known peer'))

        connectTo(p)
        cb()
      }
    }

    server.on('remote:authorized', function (rpc, authed) {
      //don't track cli/web client connections
      if(authed.type === 'client') return

      var peer = rpc._peer
      if(!peer) //incomming connection...
        peer = get(rpc.authorized.id)
      if(peer) {
        peer.id = rpc.authorized.id
        peer.connected = true
      }

    })

    var host = config.host || nonPrivate.private() || 'localhost'
    var port = config.port

    pull(
      server.ssb.messagesByType({type: 'pub', live: true, keys: false}),
      pull.map(function (e) {
        var o = toAddress(e.content.address)
        return o
      }),
      pull.filter(function (e) {
        if(e.port == port) {
          if(e.host == host) return false
          if(e.host == '127.0.0.1' || e.host == 'localhost') return false
        }
        return true
      }),
      pull.drain(function (e) {
        if(!u.find(peers, sameHost(e))) peers.push(e)
      })
    )

    server.on('local', function (_peer) {
      var peer = get(_peer.id)
      if(!peer) peers.push(_peer)
      else {
        // peer host could change while in use.
        // currently, there is a DoS vector here
        // (someone could falsely advertise your id,
        // but they could not steal they need private key)
        // since this is only over local network, it's not a big vector.
        peer.host = _peer.host
        peer.port = _peer.port
      }
    })

    ;(function schedule() {
      if(server.closed) return
      sched = setTimeout(function () {
        schedule(); connect()
      },
      ~~(config.timeout/2 + Math.random()*config.timeout)
      )
    })()

    var count = 0

    function connect () {
      if(server.closed) return

      //two concurrent connections.
      if(count >= (conf.connections || 2)) return

      // connect to this random peer
      var p = rand(peers.filter(function (e) {
        var lim = (1/(1+e.failure)) || 1 // decrease odds of selection due to failures
        return !e.connected && (Math.random() < lim)
      }))

      if(p) {
        count ++
        var rpc = connectTo(p)
        rpc.on('closed', function () {
          count = Math.max(count - 1, 0)
        })

      }
    }

    function connectTo (p) {
      p.time = p.time || {}
      if (!p.time.connect)
        p.time.connect = 0
      p.time.attempt = Date.now()
      p.connected = true
      
      var rpc = server.connect(p)
      rpc._peer = p
      rpc.on('remote:authorized', function () {
        p.id = rpc.authorized.id
        p.time = p.time || {}
        p.time.connect = Date.now()
      })

      rpc.on('closed', function () {
        //track whether we have successfully connected.
        //or how many failures there have been.
        p.connected = false
        server.emit('log:info', ['SBOT', rpc._sessid, 'disconnect'])

        var fail = !p.time || (p.time.attempt > p.time.connect)

        if(fail) p.failure = (p.failure || 0) + 1
        else     p.failure = 0

        // :TODO: delete local peers if failure > N
      })

      return rpc
    }

    return gossip
  }
}
