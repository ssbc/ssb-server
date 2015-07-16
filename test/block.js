var cont = require('cont')
var tape = require('tape')
var pull = require('pull-stream')

var replicate = require('../plugins/replicate')
var friends   = require('../plugins/friends')

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
  .use(replicate).use(friends) //but not gossip, yet


var dbB = createDB('test-block-bob', {
    port: 45452, host: 'localhost', timeout: 600,
  })
  .use(replicate).use(friends) //but not gossip, yet

var dbC = createDB('test-block-carol', {
    port: 45453, host: 'localhost', timeout: 600,
  })
  .use(replicate).use(friends) //but not gossip, yet

var alice = dbA.feed
var carol = dbC.feed
var bob = dbB.feed

tape('alice blocks bob, and bob cannot connect to alice', function (t) {

  //in the beginning alice and bob follow each other
  cont.para([
    alice.add('contact', {contact: {feed: bob.id},   following: true}),
    bob  .add('contact', {contact: {feed: alice.id}, following: true}),
    carol.add('contact', {contact: {feed: alice.id}, following: true})
  ]) (function (err) {
    if(err) throw err

    var n = 3, rpc

    dbB.connect(dbA.getAddress(), function (err, _rpc) {
      if(err) throw err
      //replication will begin immediately.
      rpc = _rpc
      next()
    })

    var bobCancel = dbB.ssb.post(function (op) {
      //should be the alice's follow(bob) message.
      console.log(op)
      t.equal(op.value.content.contact.feed, bob.id)
      next()
    })

    var aliceCancel = dbA.ssb.post(function (op) {
      //should be the bob's follow(alice) message.
      console.log(op)
      t.equal(op.value.content.contact.feed, alice.id)
      next()
    })

    function next () {
      if(--n) return
      rpc.close();
      aliceCancel(); bobCancel()
      console.log('ALICE BLOCKS BOB', {
        source: alice.id, dest: bob.id
      })
      alice.add({type: 'contact', contact: {feed: bob.id}, flag: true})
      (function (err) {
        if(err) throw err
        pull(
          dbA.ssb.links({
            source: alice.id,
            dest: bob.id,
            type: 'feed',
            rel: 'contact',
            values: true
          }),
          pull.filter(function (op) {
            return op.value.content.flag != null
          }),
          pull.collect(function (err, ary) {
            if(err) throw err
            t.ok(flagged = ary.pop().value.content.flag, 'alice did block bob')

            //since bob is blocked, he should not be able to connect
            dbB.connect(dbA.getAddress(), function (err) {
              t.ok(err, 'bob is blocked, should fail to connect to alice')

              //but carol, should, because she is not blocked.
              dbC.connect(dbA.getAddress(), function (err) {
                t.notOk(err)
                t.end()
              })
            })

          })
        )
      })
    }
  })
})

tape('carol does not let bob replicate with alice', function (t) {
  return t.end()
  //first, carol should have already replicated with alice.

  //emits this event when did not allow bob to get this data.
  dbC.on('replicate:blocked', function (data) {

  })

  dbB.on('replicate:finish', function (vclock) {
    console.log('BOB REPLICATED FROM CAROL')
    console.log(vclock)
  })

  dbB.connect(dbC.getAddress(), function(err) {

  })

})

tape('cleanup!', function (t) {
  dbA.close(); dbB.close(); dbC.close()
  t.end()
})
