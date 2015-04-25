
var scuttlebot = require('../')
var ssbkeys = require('ssb-keys')
var tape = require('tape')

tape('test api', function (t) {

  var u = require('./util')

  var server = u.createDB('test-alice', {
    port: 45451, host: 'localhost',
  })
  var alice = server.feed

  //request a secret that with particular permissions.
  var secret = server.createAccessKey({allow: ['emit', 'publish']})

  var client = scuttlebot.createClient({port: 45451, host: 'localhost'})

  var signed = ssbkeys.signObjHmac(secret, {
    role: 'client',
    ts: Date.now(),
    keyId: server.options.hash(secret)
  })

  client.auth(signed, function (err, authed) {
    if(err) throw err
    t.ok(authed.granted)
    client.publish({type: 'msg', value: 'hello'}, function (err, data) {
      if(err) throw err
      t.equal(data.value.content.value, 'hello')
      client.close(function() {
        server.close()
        t.end()
      })
    })
  })
})
