var tape = require('tape')
var pull = require('pull-stream')
var ssbKeys = require('ssb-keys')

var createSbot = require('../')
  .use(require('../plugins/master'))
  .use(require('../plugins/crypto'))

var alice = ssbKeys.generate()
var bob = ssbKeys.generate()

var aliceDb = createSbot({
  temp: 'test-alice',
  keys: alice
})

tape('end2end a message, and test that indexes work', function (t) {

  aliceDb.publish(
    ssbKeys.box({
      type: 'post',
      text: 'a scary secret'
    }, [alice.public, bob.public]),
    function (err, msg) {
      console.log(msg)

      aliceDb.publish(
        ssbKeys.box({
          type: 'post',
          reply: msg.key,
          text: 'oh wow crazy'
        }, [alice.public, bob.public]),
        function (err, msg) {
          pull(
            aliceDb.links({type: 'msg'}),
            pull.collect(function (err, ary) {
              t.end()
              aliceDb.close(true)
            })
          )
      })
    })
})

tape('crypto.publishBoxed', function (t) {

  aliceDb.crypto.publishBoxed(
    {
      type: 'post',
      text: 'a scary secret'
    }, [alice.public, bob.public],
    function (err, msg) {
      console.log(msg)

      aliceDb.crypto.publishBoxed(
        {
          type: 'post',
          reply: msg.key,
          text: 'oh wow crazy'
        }, [alice.public, bob.public],
        function (err, msg) {
          pull(
            aliceDb.links({type: 'msg'}),
            pull.collect(function (err, ary) {
              t.end()
              aliceDb.close(true)
            })
          )
      })
    })
})

tape('crypto.unbox', function (t) {

  aliceDb.crypto.publishBoxed(
    {
      type: 'post',
      text: 'a scary secret'
    }, [alice.public, bob.public],
    function (err, msg) {
      console.log(msg)

      var plain = aliceDb.crypto.unbox(msg.value.content)
      t.equal(plain.type, 'post')
      t.equal(plain.text, 'a scary secret')
      t.end()
    })
})