
var cont      = require('cont')
var deepEqual = require('deep-equal')
var tape      = require('tape')

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...
var replicate = require('../plugins/replicate')
var gossip    = require('../plugins/gossip')

tape('replicate between 3 peers', function (t) {

  var u = require('./util')

  var dbA = u.createDB('test-alice', {
      port: 45451, host: 'localhost',
    })

  var alice = dbA.feed

  var dbB = u.createDB('test-bob', {
      port: 45452, host: 'localhost',
      seeds: [{port: 45451, host: 'localhost'}]
    })
  var bob = dbB.feed

  var dbC = u.createDB('test-carol', {
      port: 45453, host: 'localhost',
      seeds: [{port: 45451, host: 'localhost'}]
    })
  var carol = dbC.feed


  cont.para([
    alice.add('pub', {address: {host: 'localhost', port: 45451}}),
    bob  .add('pub', {address: {host: 'localhost', port: 45452}}),
    carol.add('pub', {address: {host: 'localhost', port: 45453}}),

    alice.add('flw', {feed: bob.id,   rel: 'follows'}),
    alice.add('flw', {feed: carol.id, rel: 'follows'}),

    bob  .add('flw', {feed: alice.id, rel: 'follows'}),
    bob  .add('flw', {feed: carol.id, rel: 'follows'}),

    carol.add('flw', {feed: alice.id, rel: 'follows'}),
    carol.add('flw', {feed: bob.id,   rel: 'follows'})
  ]) (function () {

    //TODO: detect when everything has been replicated
    //and end the test.

    var expected = {}

    expected[alice.id] = expected[bob.id] = expected[carol.id] = 4

    function check(server, name) {
      var closed = false
      return server.on('replicate:finish', function (actual) {
        console.log(expected)
        console.log(actual)
        console.log('*************')
        if(deepEqual(expected, actual) && !closed) {
          console.log('consistent', name)
          closed = true
          done()
        }
      })
    }

    var serverA = check(dbA, 'ALICE')
      .use(replicate).use(gossip)

    var serverB = check(dbB, 'BOB')
      .use(replicate).use(gossip)

    var serverC = check(dbC, 'CAROL')
      .use(replicate).use(gossip)

    var n = 2

    function done () {
      if(--n) return
      serverA.close()
      serverB.close()
      serverC.close()
      t.ok(true)
      t.end()
    }

  })
})

