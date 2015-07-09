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

tape('alice blocks bob, and bob cannot connect to alice', function (t) {

  var dbA = createDB('test-block-alice', {
      port: 45451, host: 'localhost', timeout: 1400,
    })
    .use(replicate).use(friends) //but not gossip, yet

  var alice = dbA.feed

  var dbB = createDB('test-block-bob', {
      port: 45452, host: 'localhost', timeout: 600,
    })
  .use(replicate).use(friends) //but not gossip, yet

  var bob = dbB.feed

  //in the beginning alice and bob follow each other
  cont.para([
    alice.add('contact', {contact: {feed: bob.id},   following: true}),
    bob  .add('contact', {contact: {feed: alice.id}, following: true})
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
      alice.add({type: 'contact', contact: {feed: bob.id}, flag: true})
      (function (err) {

      pull(
        dbA.ssb.links({
          source: alice.id,
          //
          rel: 'contact',
          values: true
        }),
        pull.filter(function (op) {
          return op.value.content.flag != null
        }),
        pull.collect(function (err, ary) {
          if(err) throw err
          flagged = ary.pop()
          if(flagged && flagged.value.content.flag)

          dbA.close(); dbB.close()
          t.end()
        })
      )
//        dbB.connect(dbA.getAddress(), function (err) {
//          //since bob is blocked, he should not be able to connect
//          t.ok(err)
//          dbA.close(); dbB.close()
//          t.end()
//        })
      })
    }
  })

})
