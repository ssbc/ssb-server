var tape = require('tape')
var u = require('./util')
var ssbKeys = require('ssb-keys')
var client = require('../client')

tape('connect remote master', function (t) {
  var keys = ssbKeys.generate()
  var aliceDb = u.createDB('test-alice', {
      port: 45451, host: 'localhost', timeout: 2001,
      master: keys.id
   })

  var rpc = client({port: 45451})
  rpc.auth(ssbKeys.signObj(keys, {
    role: 'client',
    ts: Date.now(),
    public: keys.public
  }), function (err, res) {
    if(err) throw err
    t.equal(res.role, 'master')
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
