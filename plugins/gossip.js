var pull = require('pull-stream')

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
        return 'string' !== typeof e
      })
      .map(function (e) {
            if(isString(e)) {
              var parts = e.split(':')
              e = {host: parts[0], port: parts[1]}
            }
            e.port = e.port || DEFAULT_PORT
            return e
          })

}

function peers (server, cb) {
  var config = server.config

  var seeds = config.seeds
  seeds =
    (isArray(seeds)  ? seeds : [seeds])

  //local peers added by the local discovery...
  //could have the local plugin call a method to add this,
  //but it would be the same amount of coupling either way.
  var local = server.localPeers || []

  //NOTE: later, we will probably want to not replicate
  //with nodes that we don't (at least) recognise (know someone who knows them)
  //but for now, we can pretty much assume that if they are running
  //scuttlebot they are cool.

  pull(
    server.ssb.messagesByType('pub'),
    pull.map(function (e) {
      return e.content.address
    }),
    pull.filter(function (e) {
      return e.port !== config.port || e.host !== config.host
    }),
    pull.unique(function (e) {
      return JSON.stringify(e)
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

module.exports = function gossip (server) {
  server.on('close', function () {
    server.closed = true
  })
  var scheduled = false
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
      } else schedule()

      function schedule() {
        if(scheduled) return server.emit('log:info', ['gossip', null, 'already-scheduled'])
        scheduled = true
        setTimeout(connect, 500 + Math.random() * 1000)
      }
    })
  }

  connect()
}
