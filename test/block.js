var cont = require('cont')
var tape = require('tape')
var pull = require('pull-stream')
var ssbKeys = require('ssb-keys')

var createSbot = require('../core')
  .use(require('../plugins/friends'))
  .use(require('../plugins/block'))
  .use(require('../plugins/replicate'))

var toAddress = require('../lib/util').toAddress

// alice, bob, and carol all follow each other,
// but then bob offends alice, and she blocks him.
// this means that:
//
// 1. when bob tries to connect to alice, she refuses.
// 2. alice never tries to connect to bob. (removed from peers)
// 3. carol will not give bob any, she will not give him any data from alice.

var alice = createSbot({
  temp:'test-block-alice', timeout: 1400,
  keys:ssbKeys.generate()
})

var bob = createSbot({
  temp: 'test-block-bob', timeout: 600,
  keys:ssbKeys.generate()
})

var carol = createSbot({
  temp: 'test-block-carol', timeout: 600,
  keys:ssbKeys.generate()
})

tape('alice blocks bob, and bob cannot connect to alice', function (t) {

  //in the beginning alice and bob follow each other
  cont.para([
    cont(alice.publish)({type: 'contact', contact: {feed: bob.id},   following: true}),
    cont(bob  .publish)({type: 'contact', contact: {feed: alice.id}, following: true}),
    cont(carol.publish)({type: 'contact', contact: {feed: alice.id}, following: true})
  ]) (function (err) {
    if(err) throw err

    var n = 3, rpc

    bob.connect(alice.getAddress(), function (err, _rpc) {
      if(err) throw err
      //replication will begin immediately.
      rpc = _rpc
      next()
    })

    //get the next messages that are replicated to alice and bob,
    //and check that these are the correct follow messages.
    var bobCancel = bob.post(function (op) {
      //should be the alice's follow(bob) message.
      t.equal(op.value.author, alice.id)
      t.equal(op.value.content.contact.feed, bob.id)
      next()
    })

    var aliceCancel = alice.post(function (op) {
      //should be the bob's follow(alice) message.
      t.equal(op.value.author, bob.id)
      t.equal(op.value.content.contact.feed, alice.id)
      next()
    })

    function next () {
      if(--n) return

      rpc.close(true, function () {
        aliceCancel(); bobCancel()
        console.log('ALICE BLOCKS BOB', {
          source: alice.id, dest: bob.id
        })
        alice.publish({
          type: 'contact',
          contact: {feed: bob.id},
          flagged: true
        })
        (function (err) {
          if(err) throw err

          t.ok(alice.friends.get({source: alice.id, dest: bob.id, graph: 'flag'}))

          pull(
            alice.links({
              source: alice.id,
              dest: bob.id,
              type: 'feed',
              rel: 'contact',
              values: true
            }),
            pull.filter(function (op) {
              return op.value.content.flagged != null
            }),
            pull.collect(function (err, ary) {
              if(err) throw err
              console.log(ary)
              t.ok(flagged = ary.pop().value.content.flagged, 'alice did block bob')

              //since bob is blocked, he should not be able to connect
              bob.connect(alice.getAddress(), function (err, rpc) {
                t.ok(err, 'bob is blocked, should fail to connect to alice')
                //but carol, should, because she is not blocked.
                carol.connect(alice.getAddress(), function (err) {
                  t.notOk(err)
                })
                carol.once('replicate:finish', function (vclock) {
                  t.equal(vclock[alice.id], 2)
                  //in next test, bob connects to carol...
                  t.end()
                })
              })
            })
          )
        })
      })
    }
  })
})

tape('carol does not let bob replicate with alice', function (t) {
  //first, carol should have already replicated with alice.
  //emits this event when did not allow bob to get this data.
  bob.once('replicate:finish', function (vclock) {
    console.log('BOB REPLICATED FROM CAROL')
    t.equal(vclock[alice.id], 1)
    console.log('ALICE:', alice.id)
    t.end()
  })
  bob.connect(carol.getAddress(), function(err) {
    if(err) throw err
  })
})

//TODO test that bob is disconnected from alice if he is connected
//     and she blocks him.

//TODO test that blocks work in realtime. if alice blocks him
//     when he is already connected to alice's friend.

tape('cleanup!', function (t) {
  alice.close(true); bob.close(true); carol.close(true)
  t.end()
})
