var pull = require('pull-stream')
var toAddress = require('../lib/util').toAddress
var nonPrivate = require('non-private-ip')
var u = require('../lib/util')

/*

Track available peers, and what keys are reachable at them.

We want to make sure that we don't connect to one node
more than once.

It's easier to tell the remote connection by it's key,
because that is sent with the message, so, on connecting
outwards to a node, remember the address -> key.

So, when connecting to another node, check if you are already
connected to that key.

for an outgoing connection, remember which id it has,
and which ip:port it has.

for an incoming connection, check if you know that id,
and it's ip.

If you get an incomming connection, but have not connected
out to it yet, then you will not know what port it hosts on,
so you might connect to it twice, but this will only be a problem
early in a processes' life.

So, build up a table of ids and their addresses,

and a table of current connections,
and which id it is a connection to.

Also, for wifi networks, id->ip can change,
also it could work for a bit and then leave.
You could even have a new device join a network
and get the same ip as a previous device. (rare, but possible)

okay but local network is advertised by udp,
and that can be used to update the records.

Seeds: there are some peers that we know about when starting up.
probably want to connect to these rapidly, to check they are alive.
then, backoff on peers that are old.

---

if there have been no connection attempts to a seed
  set high priority

if a connection failed
  half priority

if a connection timed out
  reduce priority 10%

if a connection succeed after failing
  set high priority

---

randomly connect to peers

if a connection fails,
set an exponential backoff?


*/

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

function rand(array) {
  return array[~~(Math.random()*array.length)]
}

function reduce(obj, reduce, init) {
  var acc = init
  for(var k in obj)
    acc = reduce(acc, obj[k])
  return acc
}

var DEFAULT_PORT = 2000

function clean (ary) {
  return ary
      .filter(Boolean)
      .filter(function (e) {
        return e && 'string' !== typeof e && e.host
      })
      .map(toAddress)
}

function seeds (server, cb) {
  var config = server.config

  var seeds = config.seeds
  seeds =
    (isArray(seeds)  ? seeds : [seeds])

  //this may be disabled by --no-local option
  var local = config.local
    ? (server.local ? server.local.get() : [])
    : []

  //NOTE: later, we will probably want to not replicate
  //with nodes that we don't (at least) recognise (know someone who knows them)
  //but for now, we can pretty much assume that if they are running
  //scuttlebot they are cool.

  if(!config.pub)
    return cb(null, seeds.concat(local))

  pull(
    server.ssb.messagesByType('pub'),
    pull.map(function (e) {
      var o = toAddress(e.content.address)
      o.id = e.content.id || e.author
      return o
    }),
    pull.filter(function (e) {
      return e.port !== config.port || e.host !== config.host
    }),
    pull.unique(function (e) {
      return e.host + ":" + e.port
    }),
    pull.collect(function (err, ary) {
      var peers = clean((ary || []).concat(seeds).concat(local))
      var host = config.host || nonPrivate.private() || 'localhost'
      var port = config.port

      //filter out peers which are probably you.
      peers = peers.filter(function (e) {
        if(e.port == port) {
          if(e.host == host) return false
          if(e.host == '127.0.0.1' || e.host == 'localhost') return false
        }

        return true
      })
      cb(null, peers)
    })
  )

}

function sameHost(e) {
  return function (p) {
      return p.host == e.host && e.port == e.port
    }
}

var isArray = Array.isArray

function isObject (o) {
  return o && 'object' === typeof o
}

module.exports = {
  name: 'gossip',
  version: '1.0.0',
  manifest: {
    seeds: 'async',
    peers: 'sync',
    connections: 'sync',
  },
  init: function (server) {
    var sched
    server.on('close', function () {
      server.closed = true
      clearTimeout(sched)
    })

    var conf = server.config.gossip || {}

    //current list of known peers.
    var peers = []

    function get(id) {
      return u.find(peers.filter(Boolean), function (e) {
        return e.id === id
      })
    }

    var gossip = {
      seeds: function (_, cb) {
        if(isFunction(_)) cb = _
        seeds(server, cb)
      },
      peers: function () {
        return peers
      },
      connections: function () {
        return connections
      }
    }

    var connections = {}
    var scheduled = false

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

    //add all the seeds
    ;(function initPeers () {
      gossip.seeds(function (_, ary) {
        ary.forEach(function (e) {
          if(e && !u.find(peers, sameHost(e)))
            peers.push(e)
        })
      })
    })()

    ;(function schedule() {
      if(server.closed) return
      sched = setTimeout(function () {
        schedule(); connect()
      }, 500 + ~~(Math.random() * 1000))
    })()

    var current = 0

    function connect () {
      if(server.closed) return

      //two concurrent connections.
      if(current >= (conf.connections || 2)) return
      current ++

      // connect to this random peer
      var p = rand(peers.filter(function (e) {
        return !e.connected
        //TODO: filter out peers that we have been unable to connect to.
        // (where failure > 0, give them exponential backoff...)
        //if they also have a private ip (local network)
        //delete them after too many trys
      }))

      if(p) {
        p.time = p.time || {}
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

          var fail = !p.time || (p.time.attempt > p.time.connect)

          if(fail) p.failure = (p.failure || 0) + 1
          else     p.failure = 0

          current = Math.max(current - 1, 0)
        })

      }
    }

    return gossip
  }
}
