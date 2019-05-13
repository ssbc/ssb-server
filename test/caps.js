
var cont      = require('cont')
var deepEqual = require('deep-equal')
var tape      = require('tape')
var pull      = require('pull-stream')
var ssbKeys   = require('ssb-keys')

var u = require('./util')

// create 3 servers
// give them all pub servers (on localhost)
// and get them to follow each other...

var createSsbServer =
  require('secret-stack')(require('./defaults'))
    .use(require('ssb-db'))
    .use(require('ssb-replicate'))
    .use(require('ssb-friends'))
    .use(require('ssb-gossip'))
    .use(require('ssb-logging'))

var createHash = require('crypto').createHash

function hash (data) {
  return createHash('sha256').update(data, 'utf8').digest()
}

var sign_cap1 = hash('test-sign-cap1')
var shs_cap1 = hash('test-shs-cap1')

var alice, bob, carol
var dbA = createSsbServer({
  temp: 'server-alice',
  port: 45451, timeout: 1400,
  keys: alice = ssbKeys.generate(),
  caps: {
    shs: shs_cap1,
    sign: sign_cap1
  },
  level: 'info'
})

//uses default caps, incompatible with above
var dbB = createSsbServer({
  temp: 'server-bob',
  port: 45452, timeout: 1400,
  keys: bob = ssbKeys.generate(),
  seeds: [dbA.getAddress()],
  level: 'info'
})

//can connect to A
var dbC = createSsbServer({
  temp: 'server-carol',
  port: 45453, timeout: 1400,
  keys: alice = ssbKeys.generate(),
  caps: {
    shs: shs_cap1,
    sign: sign_cap1
  },
  level: 'info'
})


tape('signatures not accepted if made from different caps', function (t) {


  dbA.publish({type: 'test', foo: true}, function (err, msg) {
    if(err) throw err
    console.log(msg)
    dbB.add(msg.value, function (err) {
      t.ok(err) //should not be valid in this universe
      t.ok(/invalid/.test(err.message))
      console.log(err.stack)
      t.end()

    })
  })
})

tape('cannot connect if different shs caps, custom -> default', function (t) {
  dbA.connect(dbB.getAddress(), function (err) {
    t.ok(err)
    console.log(err.stack)

    t.end()

  })

})

tape('cannot connect if different shs caps, default -> custom', function (t) {
  dbB.connect(dbA.getAddress(), function (err) {
    t.ok(err)

    console.log(err.stack)
    t.end()
  })
})

tape('cannot connect if different shs caps, default -> custom', function (t) {
  dbC.connect(dbA.getAddress(), function (err) {
    if(err) throw err
    t.end()
  })
})


tape('cleanup', function (t) {
  dbA.close()
  dbB.close()
  dbC.close()
  t.end()
})



