var tape = require('tape')
var pull = require('pull-stream')
var ssbKeys = require('ssb-keys')

var createSbot = require('../')
  .use(require('../plugins/master'))
  .use(require('../plugins/private'))

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
            })
          )
      })
    })
})

tape('private.publish', function (t) {

  aliceDb.private.publish(
    {
      type: 'post',
      text: 'a scary secret'
    }, [alice.public, bob.public],
    function (err, msg) {
      console.log(msg)

      aliceDb.private.publish(
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
            })
          )
      })
    })
})

tape('private.unbox', function (t) {

  aliceDb.private.publish(
    {
      type: 'post',
      text: 'a scary secret'
    }, [alice.public, bob.public],
    function (err, msg) {
      console.log(msg)

      var plain = aliceDb.private.unbox(msg.value.content)
      t.equal(plain.type, 'post')
      t.equal(plain.text, 'a scary secret')
      t.end()
      aliceDb.close(true)
    })
})