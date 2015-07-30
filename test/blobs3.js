var fs        = require('fs')
var tape      = require('tape')
var path      = require('path')
var toPull    = require('stream-to-pull-stream')
var pull      = require('pull-stream')
var cont      = require('cont')
var Hasher    = require('multiblob/util').createHash
var ssbKeys   = require('ssb-keys')
var u         = require('./util')

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...

var alg = 'sha256'

function read (filename) {
  return toPull.source(fs.createReadStream(filename))
}

var createSbot = require('../')
  .use(require('../plugins/friends'))
  .use(require('../plugins/gossip'))
  .use(require('../plugins/replicate'))
  .use(require('../plugins/blobs'))

tape('tracks requests and failed searches', function (t) {

  var alice = createSbot({
      temp: 'test-blobs-alice6', timeout: 1000,
      keys: ssbKeys.generate()
    })

  var bob = createSbot({
      temp: 'test-blobs-bob6', timeout: 1000,
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

      var hash = '&'+hasher.digest
      console.log('WANT:', hash)

      cont.para([
        alice.publish(u.file(hash)),
        alice.publish(u.follow(bob.id)),
        bob.publish(u.follow(alice.id))
      ])(function (err, data) {
        if(err) throw err
        console.log('msgs added')
      })

      // bump the number of wants by bob to 4
      bob.blobs.want(hash, function (err, has) {
        console.log('WANT, WAITED', err, has)
      })
      bob.blobs.want(hash, { nowait: true }, function (err, has) {
        console.log('WANT, NOWAITED1', err, has)
      })
      bob.blobs.want(hash, { nowait: true }, function (err, has) {
        console.log('WANT, NOWAITED2', err, has)
      })
      bob.blobs.want(hash, { nowait: true }, function (err, has) {
        console.log('WANT, NOWAITED3', err, has)
      })

      var n = 2
      bob.on('rpc:connect', function (rpc) {
        if(--n) return
        rpc.on('closed', function () {
          alice.close(true); bob.close(true)
          var wants = bob.blobs.wants()
          console.log(wants)
          t.equal(wants[0].requests, 4)
          t.ok(wants[0].notfounds >= 2)
          t.end()
        })
      })
    })
  )
})
