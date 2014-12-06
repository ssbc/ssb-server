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

function peers (server, cb) {
  var config = server.config

  var seeds = config.seeds
  seeds =
    (isArray(seeds)  ? seeds : [seeds]).filter(Boolean)
      .map(function (e) {
            if(isString(e)) {
              var parts = e.split(':')
              e = {host: parts[0], port: parts[1]}
            }
            e.port = e.port || DEFAULT_PORT
            return e
          })

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
    pull.collect(function (err, ary) {
      cb(null, (ary || []).concat(seeds).concat(local))
    })
  )

}

var isArray = Array.isArray

function isObject (o) {
  return o && 'object' === typeof o
}

module.exports = function (server) {
  server.on('close', function () {
    server.closed = true
  })

  function connect () {
    if(server.closed) return
    peers(server, function (err, ary) {
      var nPeers = ary.length
      var p = ary[~~(Math.random()*nPeers)]
      // connect to this random peer
      if(p) {
        console.log('GOSSIP connect to', p)
        var rpc = server.connect(p, function() {
          server.emit('gossip:connect', rpc)
        })
        rpc.on('closed', schedule)
      } else schedule()

      function schedule() {
        // try to hit each peer approx once a minute
        // - if there's one peer, wait 60-63s
        // - if there's two peers, wait 30-33s
        // - if there's 15 peers, wait 4-7s
        // - if there's 30 peers, wait 2-5s
        // - if there's 60+ peers, wait 1-4s
        //var baseWait = (60 / nPeers)|0
        //if (baseWait < 1) baseWait = 1

        //setTimeout(connect, baseWait*1000 + Math.random() * 3000)
        setTimeout(connect, 500 + Math.random() * 1000)
      }
    })
  }

  connect()
}
