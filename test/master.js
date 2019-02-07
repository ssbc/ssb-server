var tape = require('tape')
//var util = require('../lib/util')
var ssbKeys = require('ssb-keys')
var ssbClient = require('ssb-client')

var aliceKeys = ssbKeys.generate()
var bobKeys   = ssbKeys.generate()
var carolKeys = ssbKeys.generate()

var createSsbServer = 
  require('secret-stack')(require('./defaults'))
    .use(require('ssb-db'))
  .use(require('../plugins/master'))
var caps = {
  shs: require('crypto').randomBytes(32).toString('base64')
}

var alice = createSsbServer({
  port: 45451, timeout: 2001,
  temp: 'master',
  host: 'localhost',
  master: bobKeys.id,
  keys: aliceKeys,
  caps: caps
})

tape('connect remote master', function (t) {
  console.log(alice.config)
  ssbClient(bobKeys, {
    remote: alice.getAddress(),
    manifest: alice.manifest(),
    caps: caps,
  }, function (err, rpc) {
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
  ssbClient(carolKeys, {
    remote: alice.getAddress(),
    manifest: alice.manifest(),
    caps: caps
  }, function (err, rpc) {
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

