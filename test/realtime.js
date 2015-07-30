
var cont      = require('cont')
var deepEqual = require('deep-equal')
var tape      = require('tape')
var pull      = require('pull-stream')
var u         = require('./util')

var ssbKeys = require('ssb-keys')

var createSbot = require('../')
  .use(require('../plugins/friends'))
  .use(require('../plugins/replicate'))
  .use(require('../plugins/gossip'))
  .use(require('../plugins/logging'))

tape('replicate between 3 peers', function (t) {

  var bob = createSbot({
      temp: 'test-bob',
      port: 45452, host: 'localhost',
      keys: ssbKeys.generate()
    })

  var alice = createSbot({
      temp: 'test-alice',
      port: 45453, host: 'localhost',
      seeds: [bob.getAddress()],
      keys: ssbKeys.generate()
    })

  cont.para([
    alice.publish(u.follow(bob.id)),
    bob.publish(u.follow(alice.id))
  ])(function (err) {
    if(err) throw err

    var ary = []
    pull(
      bob.createHistoryStream({id: alice.id, seq: 0, keys: false, live: true}),
      pull.drain(function (data) {
        ary.push(data);
      })
    )
    var l = 12
    var int = setInterval(function () {
      if(!--l) {
        clearInterval(int)
        var _ary = []
          pull(
            bob.createHistoryStream({id: alice.id, sequence: 0, keys: false}),
            pull.collect(function (err, _ary) {
              t.equal(_ary.length, 12)
              t.deepEqual(ary,_ary)
              bob.close(true); alice.close(true)

              t.end()
            })
          )
      }
      else
        alice.publish({type: 'test', value: new Date()},
          function (err, msg){
            if(err) throw err
            console.log('added', msg.key, msg.value.sequence)
          })
    }, 200)

  })
})
