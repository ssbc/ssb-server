var cont = require('cont')
var tape = require('tape')
var pull = require('pull-stream')

var replicate = require('../plugins/replicate')
var friends   = require('../plugins/friends')
var block   = require('../plugins/block')
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
    .use(require('../plugins/friends'))
    .use(require('../plugins/replicate'))
    .use(require('../plugins/block'))

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

function follow(id) {
  return {
    type: 'contact', contact: id, following: true
  }
}
function unfollow(id) {
  return {
    type: 'contact', contact: id, flagged: true
  }
}


tape('alice blocks bob while he is connected, she should disconnect him', function (t) {

  //in the beginning alice and bob follow each other
  cont.para([
    alice.publish(follow(bob.id)),
    bob  .publish(follow(alice.id)),
    carol.publish(follow(alice.id))
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
      t.equal(vclock[alice.id], 1)
      console.log('OKAY')
      alice.close();bob.close();carol.close()
      t.end()
    })

    var once = false
    var bobCancel = bob.post(function (op) {
      console.log('BOB RECV', op)
      if(once) throw new Error('should only be called once')
      once = true
      //should be the alice's follow(bob) message.

      t.equal(op.value.author, alice.id)
      t.equal(op.value.content.contact, bob.id)
      alice.publish(unfollow(bob.id))
      (function (err) { if(err) throw err })
    })
  })
})

//TODO test that blocks work in realtime. if alice blocks him
//     when he is already connected to alice's friend.

//tape('cleanup!', function (t) {
//  alice.close(); bob.close(); carol.close()
//  t.end()
//})
