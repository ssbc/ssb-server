var fs        = require('fs')
var tape      = require('tape')
var path      = require('path')
var toPull    = require('stream-to-pull-stream')
var pull      = require('pull-stream')
var cont      = require('cont')
var ssbKeys   = require('ssb-keys')
var u         = require('./util')

var crypto    = require('crypto')

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

function createHash () {
  var hash = crypto.createHash('sha256')
  var hasher = pull.through(function (data) {
    hash.update(data)
  }, function () {
    hasher.digest = '&'+hash.digest('base64')+'.sha256'
  })
  return hasher
}

var createSbot = require('../')
  .use(friends).use(blobs)

function create (name, config) { 
  return createSbot({
    temp: 'test-blobs-quotas-' + name, timeout: 1000,
    keys: ssbKeys.generate(),
    blobs: config
  })
}

var K = 1024

function test (t, a, e) {
  t.equal(a.limit, e.limit)
  t.equal(a.usage, e.usage)
  t.equal(a.hops, e.hops)
}

function hash(data) {
  return '&'+crypto.createHash('sha256').update(data).digest('base64')+'.sha256'
}

tape('test blob quota api', function (t) {

  //create 4 feeds on one sbot to test quota apis.
  var alice = create('alice', { limit: [-1, 4*K, 2*K], minLimit: 256})
  var bob   = alice.createFeed()
  var carol = alice.createFeed()
  var dan   = alice.createFeed()

  t.test('limits based on follows', function (t) {
    cont.para([
      alice.publish(u.follow(bob.id)),
      bob.add(u.follow(carol.id)),
      carol.add(u.follow(dan.id)),
    ])(function (err, data) {
      if(err) throw err
      console.log(alice.blobs.quota(alice.id))
      console.log(alice.blobs.quota(bob.id))
      console.log(alice.blobs.quota(carol.id))
      console.log(alice.blobs.quota(dan.id))

      test(t, alice.blobs.quota(alice.id), {limit: -1, usage: 0, hops: 0})
      test(t, alice.blobs.quota(bob.id),   {limit: 4*K, usage: 0, hops: 1})
      test(t, alice.blobs.quota(carol.id), {limit: 2*K, usage: 0, hops: 2})
      test(t, alice.blobs.quota(dan.id),   {limit: 256, usage: 0, hops: 3})

      t.end()
    })
  })

  t.test('file size is added correctly to a peer', function (t) {
    var rand = crypto.randomBytes(1024)
    var h = hash(rand)

    dan.add(u.file(h), function (err, msg) {
      if(err) throw err

      pull(
        pull.once(rand),
        alice.blobs.add(function (err, _hash) {
          if(err) throw err
          test(t, alice.blobs.quota(dan.id), {limit: 256, usage: 1024, hops: 3})
          t.end()          
        })
      )
    })
  })

  t.test('file size is divided between peers', function (t) {
    var rand = crypto.randomBytes(3*K)
    var h = hash(rand)

    cont.para([
      alice.publish(u.file(h)),
      bob.add(u.file(h)),
    ]) (function (err, msg) {
      if(err) throw err

      pull(
        pull.once(rand),
        alice.blobs.add(function (err, _hash) {
          if(err) throw err
          t.equal(_hash, h)
          test(t, alice.blobs.quota(alice.id), {limit: -1, usage: 1.5*K, hops: 0})
          test(t, alice.blobs.quota(bob.id),   {limit: 4*K, usage: 1.5*K, hops: 1})
          t.end()
        })
      )
    })
  })


  t.test('cleanup', function (t) {
    alice.close(true); t.end()
  })
  

})


