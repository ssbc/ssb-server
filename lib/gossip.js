var pull = require('pull-stream')

var isArray = Array.isArray

function isObject (o) {
  return o && 'object' === typeof o
}

function isFunction(f) {
  return typeof f == 'function'
}

// helper, creates an async function which passes through the given peer-set
function makePeersFn(peers) {
  return function(server, cb) { cb(null, peers) }
}

// gossip
// connects periodically to a set of peers and pulls the latest feed data from them
// - `peers`: optional, array or function(server, cb(err, peers)), a list of `{host:,port:}` addresses
//   - defaults to the seed-list in config plus any servers declared in pub messages
// - `interval`: optional, number, how long (in ms) between connects? default 3000
module.exports = function (peers, interval) {
  var server = this
  var config = server.config
  if (!peers) peers = getPeers
  if (!isFunction(peers)) peers = makePeersFn(peers)
  if (!interval) interval = 3000

  var currentTimeout, stopped = false
  function schedule() {
    if (currentTimeout)
      clearTimeout(currentTimeout)
    if (stopped)
      return
    currentTimeout = setTimeout(connect, 1000 + Math.random()*interval)
  }

  function connect () {
    currentTimeout = false

    // get peers
    peers(server, function (err, ary) {
       console.log('peers:', ary)
      var p = ary[~~(Math.random()*ary.length)]
      console.log('connect to:', p)
      if (!p) return schedule()

      //connect to this random peer
      server.downloadFeeds(p, function(err, res) {
        if (err)
          console.error('Error while downloading feeds from', p, 'Error:', err)
        schedule()
      })
    })
  }

  server.on('close', function() {
    clearTimeout(currentTimeout)
    stopped = true
  })

  connect()
}

// default peer-collection function
function getPeers (server, cb) {
  var config = server.config

  var seeds = config.seeds
  seeds =
    ( isArray(seeds)  ? seeds
    : isObject(seeds) ? [seeds]
    : [])

  pull(
    server.ssb.messagesByType('pub'),
    pull.map(function (e) {
      return e.content.address
    }),
    pull.filter(function (e) {
      console.log(e, config)
      return e.port !== config.port || e.host !== config.host
    }),
    pull.collect(function (err, ary) {
      if(err) cb(err)
      else cb(null, ary.concat(seeds))
    })
  )
}