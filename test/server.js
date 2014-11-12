
var server    = require('../')
var cont      = require('cont')
var net       = require('net')
var deepEqual = require('deep-equal')
var tape      = require('tape')

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...
var replicate = require('../plugins/replicate')
var gossip = require('../plugins/gossip')

tape('replicate between 3 peers', function (t) {

  var u = require('./util')

  var dbA = u.createDB('test-alice')
  var alice = dbA.createFeed()

  var dbB = u.createDB('test-bob')
  var bob = dbB.createFeed()

  var dbC = u.createDB('test-carol')
  var carol = dbC.createFeed()


  cont.para([
    alice.add('pub', {address: {host: 'localhost', port: 45451}}),
    bob  .add('pub', {address: {host: 'localhost', port: 45452}}),
    carol.add('pub', {address: {host: 'localhost', port: 45453}}),

    alice.add('flw', {$feed: bob.id,   $rel: 'follow'}),
    alice.add('flw', {$feed: carol.id, $rel: 'follow'}),

    bob  .add('flw', {$feed: alice.id, $rel: 'follow'}),
    bob  .add('flw', {$feed: carol.id, $rel: 'follow'}),

    carol.add('flw', {$feed: alice.id, $rel: 'follow'}),
    carol.add('flw', {$feed: bob.id,   $rel: 'follow'})
  ]) (function () {

    //TODO: detect when everything has been replicated
    //and end the test.

    var expected = {}

    expected[alice.id.toString('base64')] =
      expected[bob  .id.toString('base64')] =
      expected[carol.id.toString('base64')] = 4
    function check(server, name) {
      var closed = false
      return server.on('replicated', function (actual) {
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

    var serverA = check(server({
      port: 45451, host: 'localhost',
    },dbA, alice), 'ALICE').use(replicate).use(gossip)

    var serverB = check(server({
      port: 45452, host: 'localhost',
      seeds: [{port: 45451, host: 'localhost'}]
    },dbB, bob), 'BOB').use(replicate).use(gossip)

    var serverC = check(server({
      port: 45453, host: 'localhost',
      seeds: [{port: 45451, host: 'localhost'}]
    }, dbC, carol), 'CAROL').use(replicate).use(gossip)

    var n = 2

    function done () {
      if(--n) return
      serverA.close()
      serverB.close()
      serverC.close()

      t.end()
    }

  })
})

