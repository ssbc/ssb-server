
var tape = require('tape')
var u = require('../lib/util')

var schedule = require('../plugins/gossip/schedule')

var g = require('./data/gossip.json')

var ts = g.ts
var peers = g.peers

function delay (failures, factor, max) {
  return Math.min(Math.pow(2, failures-1)*factor, max || Number.infinity)
}

function not (fn) {
  return function (e) {
    return !fn(e)
  }
}

function maxStateChange (M, e) {
  return Math.max(M, e.stateChange || 0)
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
    var min = unconnect.reduce(maxStateChange, 0)// + opts.groupMin
    console.log('latest:', new Date(min))
    console.log('now:', new Date(ts))
    console.log('connected, unconnected, latest')
    console.log(count, unconnect.length, (ts - min)/60e3)

    console.log(
      unconnect.map(function (peer) {
        console.log(new Date(peer.stateChange), peer.failure)
        return peer.stateChange + delay(peer.failure || 0, opts.factor, opts.max)
      }).map(Date)
    )

    return unconnect.filter(function (peer) {
      return peer.stateChange + delay(peer.failure, opts.factor, opts.max) < ts
    }).sort(function (a, b) {
      return a.stateChange - b.stateChange
    })
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


tape('delay', function (t) {

  // delay by 1 second the second retry after a failure
  t.equal(delay(1, 1000, 10000), 1000)
  // 2nd: 2sec
  t.equal(delay(2, 1000, 10000), 2000)
  // 3rd: 4sec
  t.equal(delay(3, 1000, 10000), 4000)
  // 4th: 8sec
  t.equal(delay(4, 1000, 10000), 8000)
  // 5th: hit max, so only 10sec
  t.equal(delay(5, 1000, 10000), 10000)
  t.end()
})



/*
Okay, now I need a way to decide, for a given category,
when to connect next.

one aspect: next time to attempt a connection
based on number of Math.min(2^failures*factor + min, max) 

another aspect: how many connections to create at once?
easy way: filter candidates that are not connected,
          sort by next connect time, then slice first n.

but what about set a reason, which relates to the strategy,
and then connects based on that. `pending: reason` ?

and then disconnections is just a quota per reason?

but what about at startup, we create a bunch of connections,
and then some of them turn out to support longterm?
We want to apply the same filters for disconnecting.

first we filter out the various categories and numbers that we allow,
(type of connection, time the connection has been active, number
of that type of connection allowed) then close the rest.
*/


tape('max stateChange', function (t) {

  // { quota, groupMin, min, factor, max }
  console.log('Unattempted')
  console.log(
    select(peers, schedule.isUnattempted, ts, {quota: -1, groupMin: 0, min: 0, factor: 0, max: 0})
  )

  console.log()

  console.log('Reattempt')
  console.log(
    select(peers, schedule.isInactive, ts, {
      quota: 3, groupMin: 5*60e3,
      min: 10e3, factor: 60e3, max: 3*60*60e3
    }).map(u.stringifyAddress)
  )

  t.end()
})


