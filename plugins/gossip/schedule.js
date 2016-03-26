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

exports = module.exports = function (gossip, config, server) { 

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


exports.isUnattempted = function (e) {
  return !e.stateChange
}

//select peers which have never been successfully connected to yet,
//but have been tried.
exports.isInactive = function (e) {
  return e.stateChange && e.duration.mean == 0
}

function not (fn) {
  return function (e) { return !fn(e) }
}


//peers which we can connect to, but are not upgraded.
exports.isLongterm = function (e) {
  return e.ping && e.ping.rtt.mean > 0
}

//select peers which we can connect to, but are not upgraded to LT.
//assume any peer is legacy, until we know otherwise...
exports.isLegacy = not(exports.isLongterm)

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

// connect IF

// we have not attempted to connect before.

// we have not successfully connected, and it's been TIMEOUT since last try

// the peer is active legacy offline, and it's been TIMEOUT since last connect.

// the peer is longterm, and we are connected to less than 3 peers.

function compareBy (fn) {
  return function (a, b) {
    return fn(a) - fn(b)
  }
}

function reattemptDelay (e) {
  return e.stateChange + delay(5*60e3, e.failure, 5*60e3, 3*60*60e3)
}

function max (fn) {
  return function (a, b) {
    return Math.max(a, fn(b))
  }
}

//function pluck (name) { return function (e) { return e[name] } }

function _stateChange (e) {
  return e.stateChange
}

function latestStateChange (set) {
  return set.reduce(max(_stateChange))
}

exports.connect = function (peers) {
  var time = Date.now()
  //peers we haven't tried to connect with yet
  var unattempted = peers.filter(exports.isUnattempted)
  var connect = [].concat(unattempted)

  //peers we haven't successfully connect to yet
  //reconnect to a random failed peer, min every 5 minutes (12 an hour)
  //each time a peer fails, double the time until you next try it.
  var reattempt = peers.filter(and(exports.isInactive, not(isConnect)))
  var change = latestStateChange(reattempt)
  if(change + 5*min < time) {
    connect = reattempt.filter(function (e) {
      return reattemptDelay(e) < time
    }).sort(compareBy(_stateChange))
  }
//    .filter(function (e) {
//      return reattemptDelay(e) < time
//    })
//    .sort(compareBy(reattemptDelay)).slice(0, 5)

  //reattempt connecting to peers that did work once
  //but failed recently.

  //reconnect to legacy peers that are active.
  //and then wait until 5 minutes before reconnecting.
  var legacy = peers.filter(and(exports.isLegacy, not(isConnect)))

  //for long term peers,
  //connect to 3 peers. after one hour switch to another peer if available?
  if(peers.filter(and(isLongterm, isConnect)).length > 3)
  ;

  //IDEA: when there are all LT peers,
  //just replicate feeds that are new or have changed since last connect.
  //if other peer asks for a feed, ask for that feed too.
  //this way, handshake can be pretty small.
}






