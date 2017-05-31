var cont = require('cont')
var tape = require('tape')
var pull = require('pull-stream')
var u    = require('./util')

var replicate = require('../plugins/replicate')
var friends   = require('ssb-friends')
var ssbKeys = require('ssb-keys')
var toAddress = require('../lib/util').toAddress


// alice, bob, and carol all follow each other,
// but then bob offends alice, and she blocks him.
// this means that:
//
// 1. when bob tries to connect to alice, she refuses.
// 2. alice never tries to connect to bob. (removed from peers)
// 3. carol will not give bob any, she will not give him any data from alice.

var createSbot = require('../')
    .use(require('ssb-friends'))
    .use(require('../plugins/replicate'))

var alice = createSbot({
    temp: 'test-block-alice', timeout: 1000,
    keys: ssbKeys.generate()
  })

var bob = createSbot({
    temp: 'test-block-bob', timeout: 1000,
    keys: ssbKeys.generate()
  })

var carol = createSbot({
    temp: 'test-block-carol', timeout: 1000,
    keys: ssbKeys.generate()
  })



tape('alice blocks bob while he is connected, she should disconnect him', function (t) {

  //in the beginning alice and bob follow each other
  cont.para([
    alice.publish(u.follow(bob.id)),
    bob  .publish(u.follow(alice.id)),
    carol.publish(u.follow(alice.id))
  ]) (function (err) {
    if(err) throw err

    var n = 3, rpc

    bob.connect(carol.getAddress(), function (err, rpc) {
      if(err) throw err
    })

    carol.connect(alice.getAddress(), function (err, rpc) {
      if(err) throw err
    })

    bob.on('replicate:finish', function (vclock) {
      //I don't care which messages bob doesn't have of alice's
      t.ok(vclock[alice.id] < 2, 'bob has alices first message')
      alice.close();bob.close();carol.close()
      t.end()
    })

    var once = false
    var bobCancel = bob.post(function (op) {
      console.log('BOB RECV', op, bob.id)
      if(once) throw new Error('should only be called once')
      once = true
      //should be the alice's follow(bob) message.

      t.equal(op.value.author, alice.id)
      t.equal(op.value.content.contact, bob.id)
      alice.publish(u.block(bob.id))
      (function (err) { if(err) throw err })
    }, false)
  })
})



