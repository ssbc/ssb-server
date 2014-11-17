
var scuttlebot = require('../')
var opts = require('secure-scuttlebutt/defaults')
opts.stringify = require('json-human-buffer').stringify
var seal = require('../lib/seal')(opts)
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

  var client = scuttlebot.connect({port: 45451, host: 'localhost'})

  var signed = seal.signHmac(secret, {
    role: 'client',
    ts: Date.now(),
    keyId: server.options.hash(secret)
  })

  console.log('SIGNED', signed)

  client.auth(signed, function (err, authed) {
    if(err) throw err
    console.log(authed)
    client.add({type: 'msg', content: 'hello'}, function (err, data) {
      if(err) throw err
      console.log('ADDED', data)
      client.close(function () {
        server.close()
        t.end()
      })
    })
  })
})
