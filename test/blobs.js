
var fs        = require('fs')
var tape      = require('tape')
var path      = require('path')
var toPull    = require('stream-to-pull-stream')
var pull      = require('pull-stream')
var u         = require('./util')

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...
var gossip    = require('../plugins/gossip')
var blobs     = require('../plugins/blobs')

function read (filename) {
  return toPull.source(fs.createReadStream(filename))
}

tape('replicate between 3 peers', function (t) {

  var u = require('./util')

  var sbotA = u.createDB('test-alice', {
      port: 45451, host: 'localhost',
    }).use(gossip).use(blobs)

  var alice = sbotA.feed

  var sbotB = u.createDB('test-bob', {
      port: 45452, host: 'localhost',
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

