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
  function schedule() {
    setTimeout(connect, 1000 + Math.random() * 3000)
  }

  server.on('close', function () {
    server.closed = true
  })

  function connect () {
    if(server.closed) return
    peers(server, function (err, ary) {
      var p = ary[~~(Math.random()*ary.length)]
      // connect to this random peer
      if(p) {
        server.emit('log:info', '[GOSS] Select '+p.host+':'+p.port)
        var rpc = server.connect(p, function() {
          server.emit('gossip:connect', rpc)
        })
        rpc.on('closed', schedule)
      } else schedule()
    })
  }

  connect()
}
