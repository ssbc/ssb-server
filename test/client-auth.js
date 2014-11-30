
var scuttlebot = require('../')
var ssbkeys = require('ssb-keys')
var tape = require('tape')

tape('test api', function (t) {

  var u = require('./util')

  var dbA = u.createDB('test-alice')
  var alice = dbA.createFeed()

  var server = scuttlebot({
    port: 45451, host: 'localhost',
  }, dbA, alice)

  //request a secret that with particular permissions.
  var secret = server.createAccessKey({allow: ['add']})

  var client = scuttlebot.createClient({port: 45451, host: 'localhost'})

  var signed = ssbkeys.signObjHmac(secret, {
    role: 'client',
    ts: Date.now(),
    keyId: server.options.hash(secret)
  })

  client.auth(signed, function (err, authed) {
    if(err) throw err
    t.ok(authed.granted)
    client.add({type: 'msg', value: 'hello'}, function (err, data) {
      if(err) throw err
      t.equal(data.content.value, 'hello')
      client.close(function() {
        server.close()
        t.end()
      })
    })
  })
})
