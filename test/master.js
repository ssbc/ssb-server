var tape = require('tape')
var util = require('../lib/util')
var ssbKeys = require('ssb-keys')
var createClient = require('../client')

var alice = ssbKeys.generate()
var bob   = ssbKeys.generate()
var carol = ssbKeys.generate()

var createSbot = require('../')
  .use(require('../plugins/master'))

var aliceDb = createSbot({
  port: 45451, timeout: 2001,
  temp: 'master',
  host: 'localhost',
  master: bob.id,
  keys: alice
})

tape('connect remote master', function (t) {

  t.equal(aliceDb.getAddress(), 'localhost:45451:'+aliceDb.id)

  t.deepEqual(
    util.parseAddress(aliceDb.getAddress()), {
    host: 'localhost',
    port: 45451,
    key: aliceDb.id
  })

  t.end()
})

tape('connect remote master', function (t) {
  var client = createClient(bob)
  client({port: 45451, key: aliceDb.id}, function (err, rpc) {
    if(err) throw err
    rpc.publish({
      type: 'msg', value: 'written by bob', from: bob.id
    }, function (err) {
      if(err) throw err
      t.end()
    })
  })
})

tape('non-master cannot use same methods', function (t) {
  var client = createClient(carol)
  client({port: 45451, key: aliceDb.id}, function (err, rpc) {
    if(err) throw err
    rpc.publish({
      type: 'msg', value: 'written by ca', from: bob.id
    }, function (err) {
      t.ok(err)
      aliceDb.close(true)
      t.end()
    })
  })
})

