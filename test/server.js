
var cont      = require('cont')
var deepEqual = require('deep-equal')
var tape      = require('tape')
var pull      = require('pull-stream')
var ssbKeys   = require('ssb-keys')

var u = require('./util')

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...

var createSbot = require('../')
  .use(require('../plugins/replicate'))
  .use(require('ssb-friends'))
  .use(require('../plugins/gossip'))
  .use(require('../plugins/logging'))

tape('replicate between 3 peers', function (t) {

  var alice, bob, carol
  var dbA = createSbot({
    temp: 'server-alice',
    port: 45451, timeout: 1400,
    keys: alice = ssbKeys.generate(),
    level: 'info'
  })
  var dbB = createSbot({
    temp: 'server-bob',
    port: 45452, timeout: 1400,
    keys: bob = ssbKeys.generate(),
    seeds: [dbA.getAddress()],
    level: 'info'
  })
  var dbC = createSbot({
    temp: 'server-carol',
    port: 45453, timeout: 1400,
    keys: carol = ssbKeys.generate(),
    seeds: [dbA.getAddress()],
    level: 'info'
  })

  var apub = cont(dbA.publish)
  var bpub = cont(dbB.publish)
  var cpub = cont(dbC.publish)

  cont.para([
    apub(u.pub(dbA.getAddress())),
    bpub(u.pub(dbB.getAddress())),
    cpub(u.pub(dbC.getAddress())),

    apub(u.follow(bob.id)),
    apub(u.follow(carol.id)),

    bpub(u.follow(alice.id)),
    bpub(u.follow(carol.id)),

    cpub(u.follow(alice.id)),
    cpub(u.follow(bob.id))
  ]) (function (err, ary) {
    if(err) throw err

    var expected = {}
    expected[alice.id] = expected[bob.id] = expected[carol.id] = 3

    function check(server, name) {
      var closed = false
      return server.on('replicate:finish', function (actual) {
        console.log(actual)
        if(deepEqual(expected, actual) && !closed) {
          closed = true
          done()
        }
      })
    }

    var serverA = check(dbA, 'ALICE')
    var serverB = check(dbB, 'BOB')
    var serverC = check(dbC, 'CAROL')

    var n = 2

    function done () {
      if(--n) return
      dbA.close(true); dbB.close(true); dbC.close(true)
      t.ok(true)
      t.end()
    }
  })
})





