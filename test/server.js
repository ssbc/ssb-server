
var cont      = require('cont')
var deepEqual = require('deep-equal')
var tape      = require('tape')
var pull      = require('pull-stream')

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...
var replicate = require('../plugins/replicate')
var gossip    = require('../plugins/gossip')
var friends   = require('../plugins/friends')
var logging   = require('../plugins/logging')

tape('replicate between 3 peers', function (t) {

  var u = require('./util')

  var dbA = u.createDB('test-alice', {
      port: 45451, host: 'localhost', timeout: 1400,
    })

  var alice = dbA.feed

  var seed_alice = {port: 45451, host: 'localhost', key: alice.keys.public}

  var dbB = u.createDB('test-bob', {
      port: 45452, host: 'localhost', timeout: 600,
      seeds: [seed_alice]
    })
  var bob = dbB.feed
  var seed_bob = {port: 45452, host: 'localhost', key: bob.keys.public}

  var dbC = u.createDB('test-carol', {
      port: 45453, host: 'localhost', timeout: 2000,
      seeds: [seed_alice]
    })
  var carol = dbC.feed
  var seed_carol = {port: 45453, host: 'localhost', key: carol.keys.public}

  cont.para([
    alice.add('pub', {address: seed_alice}),
    bob  .add('pub', {address: seed_bob}),
    carol.add('pub', {address: seed_carol}),

    alice.add('contact', {contact: {feed: bob.id},   following: true}),
    alice.add('contact', {contact: {feed: carol.id}, following: true}),

    bob  .add('contact', {contact: {feed: alice.id}, following: true}),
    bob  .add('contact', {contact: {feed: carol.id}, following: true}),

    carol.add('contact', {contact: {feed: alice.id}, following: true}),
    carol.add('contact', {contact: {feed: bob.id},   following: true})
  ]) (function () {

    var expected = {}
    expected[alice.id] = expected[bob.id] = expected[carol.id] = 4

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
      .use(replicate).use(gossip).use(friends)

    var serverB = check(dbB, 'BOB')
      .use(replicate).use(gossip).use(friends)

    var serverC = check(dbC, 'CAROL')
      .use(replicate).use(gossip).use(friends)

    pull(serverA.gossip.changes(), pull.drain(function (e) { console.log('serverA event', e) }))
    pull(serverB.gossip.changes(), pull.drain(function (e) { console.log('serverB event', e) }))
    pull(serverC.gossip.changes(), pull.drain(function (e) { console.log('serverC event', e) }))

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

