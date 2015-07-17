var cont = require('cont')
var tape = require('tape')
var pull = require('pull-stream')

var replicate = require('../plugins/replicate')
var friends   = require('../plugins/friends')
var block   = require('../plugins/block')

var createDB = require('./util').createDB
var toAddress = require('../lib/util').toAddress


// alice, bob, and carol all follow each other,
// but then bob offends alice, and she blocks him.
// this means that:
//
// 1. when bob tries to connect to alice, she refuses.
// 2. alice never tries to connect to bob. (removed from peers)
// 3. carol will not give bob any, she will not give him any data from alice.


var dbA = createDB('test-block-alice', {
    port: 45451, host: 'localhost', timeout: 1400,
  })
  .use(replicate).use(friends).use(block) //but not gossip, yet


var dbB = createDB('test-block-bob', {
    port: 45452, host: 'localhost', timeout: 600,
  })
  .use(replicate).use(friends).use(block) //but not gossip, yet

var dbC = createDB('test-block-carol', {
    port: 45453, host: 'localhost', timeout: 600,
  })
  .use(replicate).use(friends).use(block) //but not gossip, yet

var alice = dbA.feed
var bob = dbB.feed
var carol = dbC.feed

tape('alice blocks bob while he is connected, she should disconnect him', function (t) {

  //in the beginning alice and bob follow each other
  cont.para([
    alice.add('contact', {contact: {feed: bob.id},   following: true}),
    bob  .add('contact', {contact: {feed: alice.id}, following: true}),
    carol.add('contact', {contact: {feed: alice.id}, following: true})
  ]) (function (err) {
    if(err) throw err

    var n = 3, rpc

    dbB.connect(dbC.getAddress(), function (err, rpc) {
      if(err) throw err
    })

    dbC.connect(dbA.getAddress(), function (err, rpc) {
      if(err) throw err
    })

    dbB.on('replicate:finish', function (vclock) {
      t.equal(vclock[alice.id], 1)
      dbA.close();dbB.close();dbC.close()
      t.end()
    })

    var once = false
    var bobCancel = dbB.ssb.post(function (op) {
      console.log('BOB RECV', op)
      if(once) throw new Error('should only be called once')
      once = true
      //should be the alice's follow(bob) message.

      t.equal(op.value.content.contact.feed, bob.id)
      alice.add({
        type: 'contact',
        contact: {feed: bob.id},
        flagged: true
      })
      (function (err) { if(err) throw err })
    })

  })
})

//TODO test that blocks work in realtime. if alice blocks him
//     when he is already connected to alice's friend.

tape('cleanup!', function (t) {
  dbA.close(); dbB.close()
  t.end()
})
