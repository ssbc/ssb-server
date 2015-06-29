var fs        = require('fs')
var tape      = require('tape')
var path      = require('path')
var toPull    = require('stream-to-pull-stream')
var pull      = require('pull-stream')
var u         = require('./util')
var cont      = require('cont')
var Hasher    = require('multiblob/util').createHash
var createClient = require('../client')
var ssbKeys   = require('ssb-keys')

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...
var gossip    = require('../plugins/gossip')
var blobs     = require('../plugins/blobs')
var friends   = require('../plugins/friends')
var replicate = require('../plugins/replicate')

function read (filename) {
  return toPull.source(fs.createReadStream(filename))
}


tape('avoid flooding a peer with blob requests', function (t) {
  var sbotA = u.createDB('test-blobs-alice3', {
      port: 45451, host: 'localhost', timeout: 1000,
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var alice = sbotA.feed

  var sbotB = u.createDB('test-blobs-bob3', {
      port: 45452, host: 'localhost', timeout: 1000,
      seeds: [{port: 45451, host: 'localhost', key: sbotA.feed.keys.public}]
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var bob = sbotB.feed

  var hasher = Hasher()

  sbotA.on('blobs:has', function (r) {
    console.log('REQUEST', r)
  })

  pull(
    read(__filename),
    hasher,
    pull.drain(null, function (err) {

      var hash = hasher.digest
      console.log('WANT:', hash)

      cont.para([
        alice.add({type: 'post', text: 'this file', js: {ext: hash}}),
        alice.add({type: 'contact', following: true, contact: { feed: bob.id }}),
        bob.add({type: 'contact', following: true, contact: {feed: alice.id}})
      ])(function (err, data) {
        if(err) throw err
      })
      // bob should not request `hash` more than once.

      t.plan(1)

      sbotA.on('blobs:has', function (h) {
        console.log('HAS', h)
        t.deepEqual(h, [hash])
      })

      sbotB.once('rpc:connect', function (rpc) {
        console.log('rpc:connect')
        rpc.on('closed', function () {
          console.log('CLOSE???')
          rpc.close()
          sbotA.close()
          sbotB.close()
          t.end()
        })
      })
    })
  )
})

tape('emit "has" event to let peer know you have blob now', function (t) {

  var sbotA = u.createDB('test-blobs-alice5', {
      port: 45455, host: 'localhost', timeout: 1000,
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var alice = sbotA.feed

  var sbotB = u.createDB('test-blobs-bob5', {
      port: 45456, host: 'localhost', timeout: 1000,
      seeds: [{port: 45455, host: 'localhost', key: sbotA.feed.keys.public}]
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var bob = sbotB.feed

  var hasher = Hasher()

  sbotA.on('blobs:has', function (r) {
    console.log('REQUEST', r)
  })

  pull(
    read(__filename),
    hasher,
    pull.drain(null, function (err) {

      var hash = hasher.digest
      console.log('WANT:', hash)

      cont.para([
        alice.add({type: 'post', text: 'this file', js: {ext: hash}}),
        alice.add({type: 'contact', following: true, contact: { feed: bob.id }}),
        bob.add({type: 'contact', following: true, contact: {feed: alice.id}})
      ])(function (err, data) {
        if(err) throw err
      })
      // bob should not request `hash` more than once.

      t.plan(2)

      sbotB.on('blobs:got', function (h) {
        console.log('BLOBS GOT', h)
        t.equal(h, hash)
        sbotA.close()
        sbotB.close()
        t.end()
      })

      //wait for bob to request the hash
      //then add that file.
      sbotA.on('blobs:has', function (h) {
        console.log('BLOBS HAS', h)
        t.deepEqual(h, [hash])

        pull(
          read(__filename),
          sbotA.blobs.add(null, function (err, hash) {
            //have now added the blob to 
          })
        )
      })
    })
  )

  //this test should only require one connection.
  var n = 0
  sbotB.on('rpc:connect', function (rpc) {
    console.log('CONNECTED', n)
    if(++n > 1) throw new Error('connected twice')
  })
})

tape('request missing blobs again after reconnect', function (t) {
  var sbotA = u.createDB('test-blobs-alice4', {
      port: 45453, host: 'localhost', timeout: 1000,
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var alice = sbotA.feed

  var sbotB = u.createDB('test-blobs-bob4', {
      port: 45454, host: 'localhost', timeout: 1000,
      seeds: [{port: 45453, host: 'localhost', key: sbotA.feed.keys.public}]
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var bob = sbotB.feed

  var hasher = Hasher()

  sbotA.on('blobs:has', function (r) {
    console.log('REQUEST', r)
  })

  pull(
    read(__filename),
    hasher,
    pull.drain(null, function (err) {

      var hash = hasher.digest
      console.log('WANT:', hash)

      cont.para([
        alice.add({type: 'post', text: 'this file', js: {ext: hash}}),
        alice.add({type: 'contact', following: true, contact: { feed: bob.id }}),
        bob.add({type: 'contact', following: true, contact: {feed: alice.id}})
      ])(function (err, data) {
        if(err) throw err
      })
      // bob should not request `hash` more than once.

      t.plan(2)

      sbotA.on('blobs:has', function (h) {
        console.log('HAS', h)
        t.deepEqual(h, [hash])
      })

      sbotB.once('rpc:connect', function (rpc) {
        console.log('rpc:connect - 1')
        sbotB.once('rpc:connect', function (rpc) {
          console.log('rpc:connect - 2')
          rpc.on('closed', function () {
            console.log('CLOSE - request missing blobs')
            sbotA.close()
            sbotB.close()
            t.end()
          })
        })
      })
    })
  )
})

