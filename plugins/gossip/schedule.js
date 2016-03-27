var nonPrivate = require('non-private-ip')
var ip = require('ip')
var onWakeup = require('on-wakeup')
var Stats = require('statistics')
var os = require('os')
var pull = require('pull-stream')
var u = require('../../lib/util')

function rand(array) {
  return array[~~(Math.random()*array.length)]
}

function not (fn) {
  return function (e) { return !fn(e) }
}

function and () {
  var args = [].slice.call(arguments)
  return function (value) {
    return args.every(function (fn) { return fn.call(null, value) })
  }
}

//detect if not connected to wifi or other network
//(i.e. if there is only localhost)

function isOffline () {
  var lo = Object.keys(os.networkInterfaces())
  return lo.length === 1 && lo[0] === 'lo'
}

var isOnline = not(isOffline)



function createSchedule (min, max, job, server) {
  var sched
  server.once('close', function () { clearTimeout(sched) })
  return function schedule () {
    if(server.closed) return
    sched = setTimeout(job, min + (Math.random()*max))
    return schedule
  }
}

var schedule = exports = module.exports =
function (gossip, config, server) { 

  var min = 60e3, hour = 60*60e3

  function connections () {
    var ts = Date.now()
    var peers = gossip.peers()
    var attempt =
    select(peers, and(exports.isUnattempted, isOnline), ts, {
        min: 0,
      quota: 10, factor: 0, max: 0, groupMin: 0
    })

//quota, groupMin, min, factor, max
    var retry =
      select(peers, and(exports.isInactive, isOnline), ts, {
        min: 0,
        quota: 3, factor: 5*60e3, max: 3*60*60e3, groupMin: 5*50e3
      })

    var legacy =
      select(peers, and(exports.isLegacy, isOnline), ts, {
        quota: 3, factor: 5*min, max: 3*hour, groupMin: 5*min
      })

   var longterm =
    select(peers, and(exports.isLongterm, isOnline), ts, {
      quota: 3, factor: 10e3, max: 10*min, groupMin: 5e3
    })

    function all(ary, reason) {
      ary.forEach(function (peer) {
        console.log('CONNECT', reason, u.stringifyAddress(peer))
        gossip.connect(peer)
      })
    }

    all(attempt, 'attempt')
    all(retry, 'retry')
    all(legacy, 'legacy')
    all(longterm, 'longterm')

  }

    pull(
      gossip.changes(),
      pull.drain(function (ev) {
        if(ev.type == 'disconnect')
          connections()
      })
    )

    setInterval(function () {
      connections()
    }, 2e3)

    connections()

}

/*
Strategies

- if you have never attempted to connect to a peer, connect to them.

- if you have failed to connect to a peer, retry again later.
  retry after an exponential delay, but with a maximum number
  of reattempts per hour, so having lots of announcements doesn't ruin things.
  - use greater delay if you have never successfuly connected.

- if you can connect to a peer, but you where disconnected because
  it is on legacy code (ping.fail && duration.mean < 60sec)
  connect again, but max every 5 minutes.

- try to connect to 2 (or 3?) pubs that support long term connections.

- if you can connect to a pub and it supports long term connections,
  but you already have more than one LT connection, disconnect after 2 minutes.

- if you have less than 2 (or 3?) LT connections, try connecting
  to another LT capable peer, we should attempt reconnections pretty fast.
  but exponentially increase retry delays for a peer upto 5 min.
  retry N at a time, for how many connections we are short.

*/


exports.isUnattempted = function (e) {
  return !e.stateChange
}

//select peers which have never been successfully connected to yet,
//but have been tried.
exports.isInactive = function (e) {
  return e.stateChange && e.duration.mean == 0
}


//peers which we can connect to, but are not upgraded.

exports.isLongterm = function (e) {
  return e.ping && e.ping.rtt.mean > 0
}

//select peers which we can connect to, but are not upgraded to LT.
//assume any peer is legacy, until we know otherwise...
exports.isLegacy = function (peer) {
  return peer.duration.mean > 0 && !exports.isLongterm(peer)
}

module.exports.isConnectedOrConnecting = function (e) {
  return 'connected' === e.state || 'connecting' === e.state
}

function and () {
  var args = [].slice.call(arguments)
  return function (e) {
    return args.reduce(function (result, fn) {
      return result && fn(e)
    }, true)
  }
}

function delay (failures, factor, max) {
  return Math.min(Math.pow(2, failures)*factor, max || Infinity)
}

function not (fn) {
  return function (e) {
    return !fn(e)
  }
}

function maxStateChange (M, e) {
  return Math.max(M, e.stateChange || 0)
}

function peerNext(peer, opts) {
  return (peer.stateChange|0) + delay(peer.failure|0, opts.factor, opts.max)
}


//filter by type (is long term)
//filter by connected. quota - connected.

//min delay (delay since last disconnect of most recent peer in unconnected set)
//unconnected filter delay peer < min delay

//slice that quota - connected

var isConnect = schedule.isConnectedOrConnecting

function select(peers, filter, ts, opts) {
  //opts: { quota, groupMin, min, factor, max }
  var type = peers.filter(filter)
  var unconnect = type.filter(not(isConnect))
  var count = Math.max(opts.quota - type.filter(isConnect).length, 0)
  var min = unconnect.reduce(maxStateChange, 0) + opts.groupMin
  if(ts < min) return []

  return unconnect.filter(function (peer) {
    return peerNext(peer, opts) < ts
  }).sort(function (a, b) {
    return a.stateChange - b.stateChange
  }).slice(0, count)
}

  // is group min just a simple delay?
  // lets say that it is..?

  // long term connections - delay is only a few seconds.

  // legacy connections - delay is about 5 minutes.
  // -- does this limit the max number of connections to 1?
  //    say we want to connect to up to 3 legacy connections?
  //    but only every 5 minutes? wait 5 min then connect to 3?
  //       ...that works

  // retry... min delay is 5 min?

exports.select = select




