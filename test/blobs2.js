var fs        = require('fs')
var tape      = require('tape')
var path      = require('path')
var toPull    = require('stream-to-pull-stream')
var pull      = require('pull-stream')
var cont      = require('cont')
var Hasher    = require('multiblob/util').createHash
var ssbKeys   = require('ssb-keys')

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...
var gossip    = require('../plugins/gossip')
var blobs     = require('../plugins/blobs')
var friends   = require('../plugins/friends')
var replicate = require('../plugins/replicate')

var createSbot = require('../')
  .use(friends).use(gossip)
  .use(replicate).use(blobs).use(require('../plugins/logging'))

function read (filename) {
  return toPull.source(fs.createReadStream(filename))
}

var alg = 'sha256'

tape('avoid flooding a peer with blob requests', function (t) {

  var alice = createSbot({
      temp: 'test-blobs-alice3', timeout: 1000,
      keys: ssbKeys.generate()
    })

  var bob = createSbot({
      temp: 'test-blobs-bob3', timeout: 1000,
      seeds: [alice.getAddress()],
      keys: ssbKeys.generate()
    })

  var hasher = Hasher(alg)

  pull(
    read(__filename),
    hasher,
    pull.drain(null, function (err) {

      var hash = hasher.digest
      console.log('WANT:', hash)

      cont.para([
        alice.publish({type: 'post', text: 'this file', js: {ext: hash}}),
        alice.publish({type: 'contact', following: true, contact: { feed: bob.id }}),
        bob.publish({type: 'contact', following: true, contact: {feed: alice.id}})
      ])(function (err, data) {
        if(err) throw err
      })
      // bob should not request `hash` more than once.

      t.plan(1)

      var has = 0

      alice.on('blobs:has', function (h) {
        console.log('HAS', h)
        t.deepEqual(h, [hash])

        if(has++==0) {
          alice.close(true); bob.close(true)
          t.end()
        }
      })
    })
  )
})

tape('emit "has" event to let peer know you have blob now', function (t) {

  var alice = createSbot({
      temp: 'test-blobs-alice5', timeout: 1000,
      keys: ssbKeys.generate()
    })

  var bob = createSbot({
      temp: 'test-blobs-bob5', timeout: 1000,
      seeds: [alice.getAddress()],
      keys: ssbKeys.generate()
    })

  var hasher = Hasher(alg)

  alice.on('blobs:has', function (r) {
    console.log('REQUEST', r)
  })

  pull(
    read(__filename),
    hasher,
    pull.drain(null, function (err) {

      var hash = hasher.digest
      console.log('WANT:', hash)

      cont.para([
        alice.publish({type: 'post', text: 'this file', js: {ext: hash}}),
        alice.publish({type: 'contact', following: true, contact: { feed: bob.id }}),
        bob.publish({type: 'contact', following: true, contact: {feed: alice.id}})
      ])(function (err, data) {
        if(err) throw err
      })
      // bob should not request `hash` more than once.

      t.plan(2)

      bob.on('blobs:got', function (h) {
        console.log('BLOBS GOT', h)
        t.equal(h, hash)
        alice.close(); bob.close()
        t.end()
      })

      //wait for bob to request the hash
      //then add that file.
      alice.on('blobs:has', function (h) {
        console.log('BLOBS HAS', h)
        t.deepEqual(h, [hash])

        pull(
          read(__filename),
          bob.blobs.add(null, function (err, hash) {
            //have now added the blob to 
          })
        )
      })
    })
  )

  //this test should only require one connection.
  var n = 0
  bob.on('rpc:connect', function (rpc) {
    if(++n > 1) throw new Error('connected twice')
  })
})

tape('request missing blobs again after reconnect', function (t) {

  var alice = createSbot({
      temp: 'test-blobs-alice4', timeout: 2000,
      keys: ssbKeys.generate()
    })

  var bob = createSbot({
      temp: 'test-blobs-bob4', timeout: 2000,
      seeds: [alice.getAddress()],
      keys: ssbKeys.generate()
    })

  var hasher = Hasher(alg)

  pull(
    read(__filename),
    hasher,
    pull.drain(null, function (err) {

      var hash = hasher.digest

      cont.para([
        alice.publish({type: 'post', text: 'this file', js: {ext: hash}}),
        alice.publish({type: 'contact', following: true, contact: { feed: bob.id }}),
        bob.publish({type: 'contact', following: true, contact: {feed: alice.id}})
      ])(function (err, data) {
        if(err) throw err
      })
      // bob should not request `hash` more than once.

      var has = 0, connects = 0

      alice.on('blobs:has', function (h) {
        console.log('HAS', h)
        t.deepEqual(h, [hash])

        if(has++ == 1) {
          t.equal(has, connects)
          alice.close(true); bob.close(true)
          t.end()
        }
      })

      bob.on('rpc:connect', function () {
        connects ++
      })

    })
  )
})

