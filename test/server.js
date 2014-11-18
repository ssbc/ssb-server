
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
        console.log('checking', name)
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

    function setupServer(server) {
      server.on('rpc-server', function(rpc, rpcStream) {
        server.downloadFeeds({ rpc: rpc, rpcStream: rpcStream }, function(err, res) {
          if (err) throw err
          rpcStream.close(console.log)
        })
      })
      server.gossip()
      return server
    }

    var serverA = check(setupServer(server({
      port: 45451, host: 'localhost',
    },dbA, alice)), 'ALICE')

    var serverB = check(setupServer(server({
      port: 45452, host: 'localhost',
      seeds: [{port: 45451, host: 'localhost'}]
    },dbB, bob)), 'BOB')

    var serverC = check(setupServer(server({
      port: 45453, host: 'localhost',
      seeds: [{port: 45451, host: 'localhost'}]
    }, dbC, carol)), 'CAROL')

    console.log('servers setup')

    var n = 2

    function done () {
      console.log('done', n)
      if(--n) return
      console.log('shutting down')
      serverA.close()
      serverB.close()
      serverC.close()

      t.end()
    }

  })
})

