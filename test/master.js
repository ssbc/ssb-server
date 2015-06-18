var tape = require('tape')
var u = require('./util')
var ssbKeys = require('ssb-keys')
var createClient = require('../client')

tape('connect remote master', function (t) {
  var keys = ssbKeys.generate()
  var aliceDb = u.createDB('test-alice', {
      port: 45451, host: 'localhost', timeout: 2001,
      master: keys.id
   })
  var alice = aliceDb.feed.keys.public
  var client = createClient(keys)

  client({port: 45451, key: alice}, function (err, rpc) {
    if(err) throw err
    rpc.publish({
      type: 'msg', value: 'written by bob', from: keys.id
    }, function (err) {
      if(err) throw err
      aliceDb.close(function () {
        t.end()
      })
    })
  })

})
