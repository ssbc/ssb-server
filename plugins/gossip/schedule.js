var nonPrivate = require('non-private-ip')
var ip = require('ip')
var onWakeup = require('on-wakeup')
var Stats = require('statistics')
var os = require('os')
var pull = require('pull-stream')

function rand(array) {
  return array[~~(Math.random()*array.length)]
}

//detect if not connected to wifi or other network
//(i.e. if there is only localhost)
function isOffline () {
  var lo = Object.keys(os.networkInterfaces())
  return lo.length === 1 && lo[0] === 'lo'
}

function createSchedule (min, max, job, server) {
  var sched
  server.once('close', function () { clearTimeout(sched) })
  return function schedule () {
    if(server.closed) return
    sched = setTimeout(job, min + (Math.random()*max))
    return schedule
  }
}

module.exports = function (gossip, config, server) { 

    pull(
      gossip.changes(),
      pull.drain(function (ev) {
        if(ev.type == 'disconnect')
          if(count() < maxConnections) schedule()
      })
    )

    function timer (name, def) {
      //the legacy config.timeout overrides the new format,
      //because the tests won't pass otherwise.
      var val = config.timeout || (config.timers && config.timers[name])
      return !isNaN(+val) ? +val : def
    }

    var maxConnections = config.connections || 2

    var timer_ping = timer('ping', 5*60e3) //5min
    //var default_connect = timer('inactivity', 30*60e3) //30min
    var timer_reconnect = timer('reconnect', 2e3) //5sec
    var timer_legacy = timer('legacy', 10*60e3) //10min
    // RPC api
    // =======


   function immediate () {
      if(server.closed) return
      var p = choosePeer()
      console.log('connect', p)
      gossip.connect(p, function (err) {
        if(err) schedule()
      })
    }

    var schedule = createSchedule(
      1e3, timer_reconnect, immediate, server
    )

    var n = maxConnections
    while(n--) schedule()

    // watch for machine sleeps, and syncAll if just waking up
    onWakeup(function () {
      console.log('Device wakeup detected, triggering pub sync')
      immediate()
    })

    function count () {
      return gossip.peers().reduce(function (acc, peer) {
        return acc + (peer.connected || peer.connecting)&1
      }, 0)
    }

    //select a random peer that we are not currently connect{ed,ing} to
    function choosePeer () {
      if(count() > maxConnections) return
      return rand(gossip.peers().filter(function (e) {
        //if we are offline, we can still connect to localhost.
        //without this, the tests will fail.
        if(isOffline() && (!ip.isLoopback(e.host) && e.host !== 'localhost'))
          return false

        // if we have connected, but this pub is running old code,
        // don't connect again for a bit. (default: 10min)
        // (check whether it failed to return a ping)
        if(e.time && e.failure
          && e.time.attempt + Math.min(Math.pow(2, e.failure)*timer_reconnect*10, timer_legacy) < Date.now()) {
          console.log('retry delay:', e.host)
          return false
        }
        //if they don't have the ping module, they don't support
        //long lived connections, so reconnect to them later.
        
        if(e.time && e.time.connect) {
          console.log('ping failed?', e.time && e.ping && e.ping.fail, timer_legacy)
          console.log('try later?', (e.time.connect + timer_legacy) > Date.now())
        }
        if(e.time && e.ping && e.ping.fail && (e.time.connect + timer_legacy > Date.now())) {
          console.log(e.host, 'is running old code, try again later')
          return false
        }
        console.log('maybe:', e.host)
        return !(e.connected || e.connecting)
      }))
    }

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


module.exports.isUnattempted = function (e) {
  return !e.time || !e.time.attempt && !e.time.connect
}

//select peers which need to be retried, but have not been
//successfully connected to yet.
module.exports.isInactive = function (e) {
  return (e.duration.mean === 0 && e.time && (e.time.attempt && e.time.connect == null))
}

//select peers which we can connect to, but are not upgraded to LT.
module.exports.isLegacy = function (e) {
  return e.duration.mean < 60e3 && (e.ping && e.ping.fail)
}

//peers which we can connect to, but are not upgraded.
module.exports.isLongterm = function (e) {
  return e.ping && e.ping.rtt.mean > 0
}

