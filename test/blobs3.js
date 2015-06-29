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

tape('tracks requests and failed searches', function (t) {

  var sbotA = u.createDB('test-blobs-alice6', {
      port: 45493, host: 'localhost', timeout: 100,
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var alice = sbotA.feed

  var sbotB = u.createDB('test-blobs-bob6', {
      port: 45494, host: 'localhost', timeout: 100,
      seeds: [{port: 45493, host: 'localhost', key: sbotA.feed.keys.public}]
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
        console.log('msgs added')
      })

      // bump the number of wants by bob to 4
      sbotB.blobs.want(hash, function (err, has) {
        console.log('WANT, WAITED', err, has)
      })
      sbotB.blobs.want(hash, { nowait: true }, function (err, has) {
        console.log('WANT, NOWAITED1', err, has)
      })
      sbotB.blobs.want(hash, { nowait: true }, function (err, has) {
        console.log('WANT, NOWAITED2', err, has)
      })
      sbotB.blobs.want(hash, { nowait: true }, function (err, has) {
        console.log('WANT, NOWAITED3', err, has)
      })

      sbotA.on('blobs:has', function (h) {
        console.log('HAS', h)
      })

      sbotB.once('rpc:connect', function (rpc) {
        console.log('rpc:connect - 1')
        sbotB.once('rpc:connect', function (rpc) {
          console.log('rpc:connect - 2')
          rpc.on('closed', function () {
            var wants = sbotB.blobs.wants()
            console.log('WANTS', wants)    
            t.equal(wants[0].requests, 4)
            t.equal(wants[0].notfounds, 2)        

            console.log('CLOSE')
            sbotA.close()
            sbotB.close()
            t.end()
          })
        })
      })
    })
  )
})
