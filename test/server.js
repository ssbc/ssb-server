
var cont      = require('cont')
var deepEqual = require('deep-equal')
var tape      = require('tape')
var ssbKeys   = require('ssb-keys')

var toAddr    = require('../lib/util').toAddress

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...

var createSbot = require('../')
  .use(require('../plugins/friends'))
  .use(require('../plugins/replicate'))
  .use(require('../plugins/gossip'))
  .use(require('../plugins/logging'))

tape('replicate between 3 peers', function (t) {

  var alice, bob, carol
  var dbA = createSbot({
    temp: 'server-alice',
    port: 45451, timeout: 1400,
    keys: alice = ssbKeys.generate(),
  })
  var dbB = createSbot({
    temp: 'server-bob',
    port: 45452, timeout: 1400,
    keys: bob = ssbKeys.generate(),
    seeds: [dbA.getAddress()]
  })
  var dbC = createSbot({
    temp: 'server-carol',
    port: 45453, timeout: 1400,
    keys: carol = ssbKeys.generate(),
    seeds: [dbA.getAddress()]
  })

  var apub = cont(dbA.publish)
  var bpub = cont(dbB.publish)
  var cpub = cont(dbC.publish)

  cont.para([
    apub({type: 'pub', address: toAddr(dbA.getAddress())}),
    bpub({type: 'pub', address: toAddr(dbB.getAddress())}),
    cpub({type: 'pub', address: toAddr(dbC.getAddress())}),

    apub({type: 'contact',
      contact: {feed: bob.id}, following: true
    }),
    apub({type: 'contact',
      contact: {feed: carol.id}, following: true
    }),

    bpub({type: 'contact',
      contact: {feed: alice.id}, following: true
    }),
    bpub({type: 'contact', content: {
      contact: {feed: carol.id}, following: true}
    }),

    cpub({type: 'contact', contact: {feed: alice.id}, following: true}),
    cpub({type: 'contact', contact: {feed: bob.id},   following: true})
  ]) (function (err, ary) {
    if(err) throw err

    //TODO: detect when everything has been replicated
    //and end the test.

    var expected = {}

    expected[alice.id] = expected[bob.id] = expected[carol.id] = 3

    function check(server, name) {
      var closed = false
      return server.on('replicate:finish', function (actual) {
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

