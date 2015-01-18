var fs        = require('fs')
var tape      = require('tape')
var path      = require('path')
var toPull    = require('stream-to-pull-stream')
var pull      = require('pull-stream')
var u         = require('./util')
var cont      = require('cont')
var Hasher    = require('multiblob/util').createHash

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

tape('replicate blobs between 2 peers - explicit want request', function (t) {

  var u = require('./util')

  var sbotA = u.createDB('test-blobs-alice1', {
      port: 45451, host: 'localhost', timeout: 1000,
    }).use(gossip).use(blobs)

  var alice = sbotA.feed

  var sbotB = u.createDB('test-blobs-bob1', {
      port: 45452, host: 'localhost', timeout: 1000,
      seeds: [{port: 45451, host: 'localhost'}]
    }).use(gossip).use(blobs)

  var bob = sbotB.feed

  pull(
    read(path.join(__filename)),
    sbotA.blobs.add()
  )

  sbotA.on('blobs:got', function (hash) {
    console.log('added', hash)
    sbotB.blobs.want(hash, function (err) {
      console.log('has!', err, hash)
      if(err) throw err
      sbotB.blobs.has(hash, function (_, has) {
        t.ok(has)
        t.end()
        sbotA.close()
        sbotB.close()
        console.log('TEST ENDED')
      })
    })

  })

})

tape('replicate published blobs between 2 peers', function (t) {

  var sbotA = u.createDB('test-blobs-alice2', {
      port: 45451, host: 'localhost', timeout: 1000,
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var alice = sbotA.feed

  var sbotB = u.createDB('test-blobs-bob2', {
      port: 45452, host: 'localhost', timeout: 1000,
      seeds: [{port: 45451, host: 'localhost'}]
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var bob = sbotB.feed


  pull(
    read(__filename),
    sbotA.blobs.add(null, function (err, hash) {
      if(err) throw err
      cont.para([
        alice.add({type: 'post', text: 'this file', ext: hash, rel: 'js'}),
        alice.add({type: 'follow', feed: bob.id, rel: 'follows'}),
        bob.add({type: 'follow', feed: alice.id, rel: 'follows'})
      ])(function (err, data) {
        if(err) throw err
        console.log(data)
      })

      // bob should request the blob,
      // and then emit this event.

      sbotB.on('blobs:got', function (_hash) {
        t.equal(_hash, hash)
        sbotB.blobs.has(hash, function (err, okay) {
          t.ok(okay, 'file replicated:' + hash)
          t.end()
          sbotA.close()
          sbotB.close()
        })
      })
    })
  )
})

tape('avoid flooding a peer with blob requests', function (t) {

  var sbotA = u.createDB('test-blobs-alice3', {
      port: 45451, host: 'localhost', timeout: 1000,
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var alice = sbotA.feed

  var sbotB = u.createDB('test-blobs-bob3', {
      port: 45452, host: 'localhost', timeout: 1000,
      seeds: [{port: 45451, host: 'localhost'}]
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
        alice.add({type: 'post', text: 'this file', ext: hash, rel: 'js'}),
        alice.add({type: 'follow', feed: bob.id, rel: 'follows'}),
        bob.add({type: 'follow', feed: alice.id, rel: 'follows'})
      ])(function (err, data) {
        if(err) throw err
      })
      // bob should not request `hash` more than once.

      t.plan(1)

      sbotA.on('blobs:has', function (h) {
        console.log('HAS', h)
        t.deepEqual(h, [hash])
      })

      sbotB.once('rpc:authorized', function (rpc) {
        console.log('rpc:authorized')
        rpc.on('closed', function () {
          console.log('CLOSE')
          t.end()
          sbotA.close()
          sbotB.close()
        })
      })
    })
  )
})


tape('request missing blobs again after reconnect', function (t) {

  var sbotA = u.createDB('test-blobs-alice4', {
      port: 45453, host: 'localhost', timeout: 1000,
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var alice = sbotA.feed

  var sbotB = u.createDB('test-blobs-bob4', {
      port: 45454, host: 'localhost', timeout: 1000,
      seeds: [{port: 45453, host: 'localhost'}]
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
        alice.add({type: 'post', text: 'this file', ext: hash, rel: 'js'}),
        alice.add({type: 'follow', feed: bob.id, rel: 'follows'}),
        bob.add({type: 'follow', feed: alice.id, rel: 'follows'})
      ])(function (err, data) {
        if(err) throw err
      })
      // bob should not request `hash` more than once.

      t.plan(2)

      sbotA.on('blobs:has', function (h) {
        console.log('HAS', h)
        t.deepEqual(h, [hash])
      })

      sbotB.once('rpc:authorized', function (rpc) {
        console.log('rpc:authorized - 1')
        sbotB.once('rpc:authorized', function (rpc) {
          console.log('rpc:authorized - 2')
          rpc.on('closed', function () {
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

tape('emit "has" event to let peer know you have blob now', function (t) {

  var sbotA = u.createDB('test-blobs-alice5', {
      port: 45455, host: 'localhost', timeout: 1000,
    }).use(gossip).use(friends).use(replicate).use(blobs)

  var alice = sbotA.feed

  var sbotB = u.createDB('test-blobs-bob5', {
      port: 45456, host: 'localhost', timeout: 1000,
      seeds: [{port: 45455, host: 'localhost'}]
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
        alice.add({type: 'post', text: 'this file', ext: hash, rel: 'js'}),
        alice.add({type: 'follow', feed: bob.id, rel: 'follows'}),
        bob.add({type: 'follow', feed: alice.id, rel: 'follows'})
      ])(function (err, data) {
        if(err) throw err
      })
      // bob should not request `hash` more than once.

      t.plan(2)

      sbotB.on('blobs:got', function (h) {
        t.equal(h, hash)
        sbotA.close()
        sbotB.close()
        t.end()
      })

      //wait for bob to request the hash
      //then add that file.
      sbotA.on('blobs:has', function (h) {
        console.log('HAS', h)
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
  sbotB.on('rpc:authorized', function (rpc) {
    if(++n > 1) throw new Error('connected twice')
  })
})
