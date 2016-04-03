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

//min delay (delay since last disconnect of most recent peer in unconnected set)
//unconnected filter delay peer < min delay
function delay (failures, factor, max) {
  return Math.min(Math.pow(2, failures)*factor, max || Infinity)
}

function maxStateChange (M, e) {
  return Math.max(M, e.stateChange || 0)
}

function peerNext(peer, opts) {
  return (peer.stateChange|0) + delay(peer.failure|0, opts.factor, opts.max)
}


//detect if not connected to wifi or other network
//(i.e. if there is only localhost)

function isOffline () {
  var lo = Object.keys(os.networkInterfaces())
  return lo.length === 1 && lo[0] === 'lo'
}

var isOnline = not(isOffline)

function isLocal (e) {
  return ip.isPrivate(e.host)
}

function isUnattempted (e) {
  return !e.stateChange
}

//select peers which have never been successfully connected to yet,
//but have been tried.
function isInactive (e) {
  return e.stateChange && e.duration.mean == 0
}

function isLongterm (e) {
  return e.ping && e.ping.rtt.mean > 0
}

//peers which we can connect to, but are not upgraded.
//select peers which we can connect to, but are not upgraded to LT.
//assume any peer is legacy, until we know otherwise...
function isLegacy (peer) {
  return peer.duration.mean > 0 && !exports.isLongterm(peer)
}

function isConnect (e) {
  return 'connected' === e.state || 'connecting' === e.state
}

function select(peers, filter, ts, opts) {
  if(opts.disable) return []
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

var schedule = exports = module.exports =
function (gossip, config, server) { 

  var min = 60e3, hour = 60*60e3

  function conf(name) {
    return config.gossip && config.gossip[name]
  }

  function connections () {
    var ts = Date.now()
    var peers = gossip.peers()
    var attempt =
    select(peers, and(exports.isUnattempted, isOnline), ts, {
        min: 0, quota: 10, factor: 0, max: 0, groupMin: 0,
        disable: +conf('global') !== 0
    })

    //quota, groupMin, min, factor, max
    var retry =
      select(peers, and(exports.isInactive, isOnline), ts, {
        min: 0,
        quota: 3, factor: 5*60e3, max: 3*60*60e3, groupMin: 5*50e3
      })

    var legacy =
      select(peers, and(exports.isLegacy, isOnline), ts, {
        quota: 3, factor: 5*min, max: 3*hour, groupMin: 5*min,
        disable: +conf('global') !== 0
      })

    var longterm =
    select(peers, and(exports.isLongterm, isOnline), ts, {
      quota: 3, factor: 10e3, max: 10*min, groupMin: 5e3,
      disable: +conf('global') !== 0
    })

    var local =
    select(peers, and(exports.isLocal, isOnline), ts, {
      quota: 3, factor: 2e3, max: 10*min, groupMin: 1e3,
      disable: +conf('local') !== 0
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
    all(local, 'local')
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
    }, 2e3).unref()

    connections()

}

exports.isUnattempted = isUnattempted
exports.isInactive = isInactive
exports.isLongterm = isLongterm
exports.isLegacy = isLegacy
exports.isLocal = isLocal
exports.isConnectedOrConnecting = isConnect
exports.select = select


