
var scuttlebot = require('../')
var opts = require('ssb-keys')
var seal = require('../lib/seal')(opts)
var tape = require('tape')
var u = require('./util')

tape('client -> server: finished job', function (t) {
  var dbA = u.createDB('test1.1')
  var alice = dbA.createFeed()

  var server = scuttlebot({
    port: 45451, host: 'localhost',
  }, dbA, alice)

  server.on('rpc:connect', function(rpc) {

    // watch for conn close
    rpc.on('close', function() {
      t.assert(1)
      console.log('conn closed')
      server.close()
      t.end()
    })

    // schedule job with a 15s timeout
    server.schedule(rpc, 'some job', 15, function(err, done) {
      t.assert(1)
      console.log('doing job')

      // finish the job in .5s
      setTimeout(function() {
        t.assert(1)
        console.log('job done')
        done()
      }, 500)
    })
  })

  var client = scuttlebot.createClient({port: 45451, host: 'localhost'})
})

tape('client -> server: expired job', function (t) {
  var dbA = u.createDB('test2.1')
  var alice = dbA.createFeed()

  var server = scuttlebot({
    port: 45451, host: 'localhost',
  }, dbA, alice)

  server.on('rpc:connect', function(rpc) {

    // watch for conn close
    rpc.on('close', function() {
      t.assert(1)
      console.log('conn closed')
      server.close()
      t.end()
    })

    // schedule job with a 15s timeout
    server.schedule(rpc, 'some job', 1, function(err, done) {
      t.assert(1)
      console.log('doing job')
    })
  })

  var client = scuttlebot.createClient({port: 45451, host: 'localhost'})
})

tape('server -> server: finished job', function (t) {
  var dbA = u.createDB('test3.1')
  var alice = dbA.createFeed()
  var serverA = scuttlebot({
    port: 45451, host: 'localhost',
  }, dbA, alice)

  var dbB = u.createDB('test3.2')
  var bob = dbB.createFeed()
  var serverB = scuttlebot({
    port: 45452, host: 'localhost',
  }, dbB, bob)

  serverA.on('rpc:connect', function(rpc) {

    // watch for conn close
    rpc.on('close', function() {
      t.assert(1)
      console.log('conn closed')
      serverA.close()
      serverB.close()
      t.end()
    })

    // schedule job with a 15s timeout
    serverA.schedule(rpc, 'some job', 15, function(err, done) {
      t.assert(1)
      console.log('doing job')

      // finish the job in .5s
      setTimeout(function() {
        t.assert(1)
        console.log('job done')
        done()
      }, 500)
    })
  })

  var client = serverB.authconnect({port: 45451, host: 'localhost'})
})