
var tape = require('tape')
var u = require('../lib/util')

var schedule = require('../plugins/gossip/schedule')

var g = require('./data/gossip.json')

var ts = g.ts
var peers = g.peers


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
      factor: 60e3, max: 3*60*60e3
    }).map(u.stringifyAddress)
  )

  console.log('Legacy')
  console.log(
    select(peers, schedule.isLegacy, ts, {
      quota: 3, groupMin: 5*60e3,
      factor: 60e3, max: 3*60*60e3
    }).map(u.stringifyAddress)
  )

  t.end()
})


