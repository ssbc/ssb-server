
var cont      = require('cont')
var deepEqual = require('deep-equal')
var tape      = require('tape')
var pull      = require('pull-stream')
var ssbKeys   = require('ssb-keys')
var ref       = require('ssb-ref')
var u = require('./util')
var isArray = Array.isArray
var crypto = require('crypto')
var createSbot = require('../')
//  .use(require('ssb-friends'))
  .use(require('../plugins/gossip'))
//  .use(require('../plugins/logging'))


var sbot = createSbot({
  temp: 'gossip',
  keys: alice = ssbKeys.generate(),
  timeout: 1000
})

var localhost = {
  host: 'localhost', port: 8888,
  key: ssbKeys.generate().id
}
var ip = {
  host: '182.23.49.132', port: 8881,
  key: ssbKeys.generate().id
}
var example = {
  host: 'example.com', port: 8889,
  key: ssbKeys.generate().id
}

var peers = JSON.parse(JSON.stringify([localhost, ip, example]))
var peers2 = peers.map(function (e) {
  var k = ssbKeys.generate().id
  return 'net:'+e.host+':'+(e.port+1)+'~shs:'+k.substring(1, k.indexOf('.')) 
})

tape('gossip: add and get peers', function (t) {

  t.ok(isArray(sbot.gossip.peers()))


  //clone input, because gossip mutates it.
  sbot.gossip.add(localhost)
  sbot.gossip.add(ip)
  sbot.gossip.add(example)

  t.deepEqual(
    sbot.gossip.peers().map(function (e) {
      console.log(e, ref.parseAddress(e.address))
      return ref.parseAddress(e.address)
    }),
    peers
  )

  sbot.gossip.peers().forEach(function (e) {
    t.equal(sbot.gossip.get(e.key).key, e.key)
  })

  t.end()

})

tape('gossip: add string address', function (t) {
  peers2.forEach(function (e) {
    sbot.gossip.add(e, 'manual')
  })
  console.log(sbot.gossip.peers())
  t.deepEqual(
    sbot.gossip.peers().map(function (e) {
      return e.address
    }).slice(3),
    peers2
  )
  t.end()
})

tape('gossip: add complex multiserver address', function (t) {
  var a = crypto.randomBytes(32).toString('base64')
  var b = crypto.randomBytes(32).toString('base64')
  var c = crypto.randomBytes(32).toString('base64')
  var addresses = [
    'ws://host.com:4030~shs:'+a,
    'onion:othuerocheureoth.onion~shs:'+c,
    'tunnel:@'+b+'.ed25519:@'+a+'.ed25519~shs:'+a
  ]
  addresses.forEach(function (e) {
    sbot.gossip.add(e, 'manual')
  })
  console.log(sbot.gossip.peers())
  t.deepEqual(
    sbot.gossip.peers().map(function (e) {
      return e.address
    }).slice(6),
    addresses
  )
  t.end()
})


tape('gossip: errors on invalid peers', function (t) {

  var pk = ssbKeys.generate().id
  console.log(pk)

  t.throws(function () {
    sbot.gossip.add({host: 5, port: 1234, key: pk})
  })

  t.throws(function () {
    sbot.gossip.add({host: '10.0.0.2', port: 'not a port', key: pk})
  })

  t.throws(function () {
    sbot.gossip.add({host: '10.0.0.2', port: 1234, key: 'not a key'})
  })

  t.end()

})

tape('ignore invalid pub messages', function (t) {

  //missing address
  sbot.publish({type: 'pub'}, function (err) {
    if(err) throw err
    t.end()
  })

})

tape('cleanup', function (t) {
  sbot.close()
  t.end()
})



