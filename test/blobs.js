var fs        = require('fs')
var tape      = require('tape')
var path      = require('path')
var toPull    = require('stream-to-pull-stream')
var pull      = require('pull-stream')
var cont      = require('cont')
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

var createSbot = require('../core')
  .use(require('../plugins/blobs'))

tape('a client can request a blob', function (t) {

  var sbotA = createSbot({
    temp: 'test-blobs-alice0',
    port: 45450, host: 'localhost', timeout: 1000,
    keys: ssbKeys.generate()
  })

  var bob = ssbKeys.generate()

  pull(
    read(path.join(__filename)),
    sbotA.blobs.add(function (err, hash) {
      if(err) throw err
      console.log(sbotA.getAddress())
      createClient(bob, sbotA.getManifest())
      (sbotA.getAddress(), function (err, rpc) {

        rpc.blobs.has(hash, function (err) {
          if(err) throw err
          pull(
            rpc.blobs.get(hash),
            pull.collect(function (err, ary) {
              if(err) throw err
              var data = Buffer.concat(ary)
              sbotA.close()
              t.equal(ssbKeys.hash(data), hash)
              t.end()
            })
          )
        })
      })
    })
  )
})

tape('replicate blobs between 2 peers - explicit want request', function (t) {

  var alice
  var sbotA = createSbot({
    temp: 'test-blobs-alice1',
    port: 45450, host: 'localhost', timeout: 1000,
    keys: alice = ssbKeys.generate()
  })

  var bob
  var sbotB = createSbot({
    temp: 'test-blobs-bob1',
    port: 45451, host: 'localhost', timeout: 1000,
    keys: bob = ssbKeys.generate()
  })

  pull(
    read(path.join(__filename)),
    sbotA.blobs.add(function (err, hash) {
      if(err) throw err
    })
  )

  sbotA.on('blobs:got', function (hash) {
    console.log('BLOBS', hash)
    console.log('added', hash)
    sbotB.blobs.want(hash, function (err) {
      if(err) throw err
      sbotB.blobs.has(hash, function (err, has) {
        if(err) throw err
        t.ok(has)
        t.end()
        sbotA.close()
        sbotB.close()
        console.log('TEST ENDED')
      })
    })
  })

  sbotA.connect(sbotB.getAddress(), function (err) {
    if(err) throw err
  })

})


tape('replicate published blobs between 2 peers', function (t) {
  createSbot.use(friends).use(replicate).use(gossip)

  var alice = createSbot({
      temp: 'test-blobs-alice2',
      port: 45451, host: 'localhost', timeout: 1000,
      keys: ssbKeys.generate()
    })

  var bob = createSbot({
      temp: 'test-bobs-alice2',
      port: 45452, host: 'localhost', timeout: 1000,
      keys: ssbKeys.generate(),
      seeds: [alice.getAddress()]
    })

  pull(
    read(__filename),
    alice.blobs.add(null, function (err, hash) {
      if(err) throw err
      cont.para([
        alice.publish({type: 'post', text: 'this file', js: {ext: hash}}),
        alice.publish({type: 'contact', following: true, contact: { feed: bob.id }}),
        bob.publish({type: 'contact', following: true, contact: {feed: alice.id}})
      ])(function (err, data) {
        if(err) throw err
        console.log(data)
      })

      // bob should request the blob,
      // and then emit this event.

      bob.on('blobs:got', function (_hash) {
        console.log("BLOBS GOT", _hash)
        t.equal(_hash, hash)
        bob.blobs.has(hash, function (err, okay) {
          t.ok(okay, 'file replicated:' + hash)
          t.end()
          alice.close(); bob.close()
        })
      })
    })
  )
})


