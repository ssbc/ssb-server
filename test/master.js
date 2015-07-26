var tape = require('tape')
var util = require('../lib/util')
var ssbKeys = require('ssb-keys')

var aliceKeys = ssbKeys.generate()
var bobKeys   = ssbKeys.generate()
var carolKeys = ssbKeys.generate()

var createSbot = require('../')
  .use(require('../plugins/master'))

var alice = createSbot({
  port: 45451, timeout: 2001,
  temp: 'master',
  host: 'localhost',
  master: bobKeys.id,
  keys: aliceKeys
})

tape('connect remote master', function (t) {

  t.equal(alice.getAddress(), 'localhost:45451:'+alice.id)

  t.deepEqual(
    util.parseAddress(alice.getAddress()), {
    host: 'localhost',
    port: 45451,
    key: alice.id
  })

  t.end()
})

tape('connect remote master', function (t) {
  createSbot.createClient({keys: bobKeys})
  (alice.getAddress(), function (err, rpc) {
    if(err) throw err
    rpc.publish({
      type: 'msg', value: 'written by bob', from: bobKeys.id
    }, function (err) {
      if(err) throw err
      t.end()
    })
  })
})

tape('non-master cannot use same methods', function (t) {
  createSbot.createClient({keys: carolKeys})
  (alice.getAddress(), function (err, rpc) {
    if(err) throw err
    rpc.publish({
      type: 'msg', value: 'written by ca', from: bobKeys.id
    }, function (err) {
      t.ok(err)
      alice.close(true)
      t.end()
    })
  })
})

