var tape = require('tape')
var pull = require('pull-stream')
var u = require('./util')
var ssbKeys = require('ssb-keys')
var createClient = require('../client')
var util = require('../lib/util')

var createSbot = require('../core')
  .use(require('../plugins/master'))

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
          reply: {msg: msg.key},
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

