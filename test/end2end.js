var tape = require('tape')
var pull = require('pull-stream')
var u = require('./util')
var ssbKeys = require('ssb-keys')
var createClient = require('../client')
var util = require('../lib/util')

tape('end2end a message, and test that indexes work', function (t) {

  var aliceDb = u.createDB('test-alice', {})
  var alice = aliceDb.feed.keys
  var bob = ssbKeys.generate()

  aliceDb.feed.add(
    ssbKeys.box({
      type: 'post',
      text: 'a scary secret'
    }, [alice.public, bob.public]),
    function (err, msg) {
      console.log(msg)

      aliceDb.feed.add(
        ssbKeys.box({
          type: 'post',
          reply: {msg: msg.key},
          text: 'oh wow crazy'
        }, [alice.public, bob.public]),
        function (err, msg) {
          console.log(msg)
          pull(
            aliceDb.ssb.links({type: 'msg'}),
            pull.collect(function (err, ary) {
              console.log(ary)
              t.end()
            })
          )
      })
    })

})

