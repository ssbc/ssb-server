var pull = require('pull-stream')
var toAddress = require('../lib/util').toAddress

/*

Track available peers, and what keys are reachable at them.

We want to make sure that we don't connect to one node
more than once.

It's easier to tell the remote connection by it's key,
because that is sent with the message, so, on connecting
outwards to a node, remember the address -> key,
and when 

so, when connecting to another node, check if you are already
connected to that key.

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

var DEFAULT_PORT = 2000

function clean (ary) {
  return ary
      .filter(Boolean)
      .filter(function (e) {
        return e && 'string' !== typeof e && e.host
      })
      .map(toAddress)

}

function peers (server, cb) {
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
      cb(null, clean((ary || []).concat(seeds).concat(local)))
    })
  )

}

var isArray = Array.isArray

function isObject (o) {
  return o && 'object' === typeof o
}

module.exports = {
  name: 'gossip',
  version: '1.0.0',
  manifest: {
    connections: 'async',
  },
  init: function (server) {
    server.on('close', function () {
      server.closed = true
    })

    var connections = {}
    var scheduled = false

    function schedule() {
      if(scheduled) return server.emit('log:info', ['gossip', null, 'already-scheduled'])
      scheduled = true
      setTimeout(connect, 500 + ~~(Math.random() * 1000))
    }

    function connect () {
      scheduled = false
      if(server.closed) return
      peers(server, function (err, ary) {
        var nPeers = ary.length
        var p = ary[~~(Math.random()*nPeers)]
        // connect to this random peer
        if(p) {
          var rpc = server.connect(p)
          rpc.on('closed', schedule)
          rpc.on('remote:authorized', function () {
            connections[rpc.authorized.id] = p
          })
        } else schedule()

      })
    }

    schedule()
  }
}
