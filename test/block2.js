var cont = require('cont')
var tape = require('tape')
var pull = require('pull-stream')
var ssbKeys = require('ssb-keys')

var createSbot = require('../')
    .use(require('../plugins/friends'))
    .use(require('../plugins/replicate'))
    .use(require('../plugins/block'))

var alice = createSbot({
    temp: 'test-block-alice', //timeout: 1400,
    keys: ssbKeys.generate()
  })

var bob = createSbot({
    temp: 'test-block-bob', //timeout: 600,
    keys: ssbKeys.generate()
  })

tape('alice blocks bob while he is connected, she should disconnect him', function (t) {

  //in the beginning alice and bob follow each other
  cont.para([
    alice.publish('contact', {contact: {feed: bob.id},   following: true}),
    bob  .publish('contact', {contact: {feed: alice.id}, following: true})
  ]) (function (err) {
    if(err) throw err

    var n = 3, rpc

    bob.connect(alice.getAddress(), function (err, rpc) {
      if(err) throw err
      //replication will begin immediately.
    })

    bob.on('replicate:finish', function (vclock) {
      console.log(vclock)
      t.equal(vclock[alice.id], 1)
      alice.close()
      bob.close()
      t.end()
    })

    var once = false
    var bobCancel = bob.post(function (op) {
      console.log('BOB RECV', op)
      if(once) throw new Error('should only be called once')
      once = true
      //should be the alice's follow(bob) message.

      t.equal(op.value.content.contact.feed, bob.id)
      alice.publish({
        type: 'contact',
        contact: {feed: bob.id},
        flagged: true
      })
      (function (err) { if(err) throw err })
    })

  })
})

