//WARNING: this test currently only passes
//if the computer has a network.
var ssbKeys = require('ssb-keys')
var tape = require('tape')
var pull = require('pull-stream')
var ssbClient = require('ssb-client')
var ref = require('ssb-ref')

var createSsbServer = require('../')
  .use(require('../plugins/master'))
  .use(require('../plugins/invite'))
  .use(require('../plugins/replicate'))

  .use(require('ssb-friends'))
  .use(require('ssb-ws'))

function all(stream, cb) {
  return pull(stream, pull.collect(cb))
}

var wsConnections = {
  incoming: {
    net: [{ scope: "public", "transform": "shs" }],
    ws: [{ scope: "public", "transform": "shs" }]
  },
  outgoing: {
    net: [{ transform: "shs" }],
    ws: [{ transform: "shs" }]
  }
}

tape('test invite.accept api', function (t) {

  var alice = createSsbServer({
    temp: 'test-invite-alice2', timeout: 100,
    allowPrivate: true,
    keys: ssbKeys.generate()
  })

  var bob = createSsbServer({
    temp: 'test-invite-bob2', timeout: 100,
    keys: ssbKeys.generate()
  })

  var carol = createSsbServer({
    temp: 'test-invite-carol2', timeout: 100,
    keys: ssbKeys.generate()
  })

  //request a secret that with particular permissions.

  alice.invite.create(1, function (err, invite) {
    if(err) throw err
    //test that invite is accepted with quotes around it.
    console.log('INVITE', invite)
    bob.invite.accept(JSON.stringify(invite), function (err) {
      if(err) throw err
      alice.friends.hops({
        source: alice.id, dest: bob.id
      }, function (err, hops) {
        if(err) throw err
        t.equal(hops[bob.id], 1, 'alice follows bob')
        carol.invite.accept(invite, function (err) {
          alice.friends.hops({
            source: alice.id, dest: bob.id
          }, function (err, hops) {
            t.equal(hops[carol.id], undefined)
            alice.close(true)
            bob.close(true)
            carol.close(true)
            t.end()
          })
        })
      })
    })
  })
})

tape('test invite.accept doesnt follow if already followed', function (t) {

  var alice = createSsbServer({
    temp: 'test-invite-alice3',
    timeout: 100,
    allowPrivate: true,
    keys: ssbKeys.generate()
  })

  var bob = createSsbServer({
    temp: 'test-invite-bob3',
    timeout: 100,
    keys: ssbKeys.generate()
  })

  //request a secret that with particular permissions.

  alice.invite.create(2, function (err, invite) {
    if(err) throw err
    bob.invite.accept(invite, function (err) {
      if(err) throw err
      alice.friends.hops(alice.id, function (err, hops) {
        if(err) throw err
        console.log(hops)
        t.equal(hops[bob.id], 1)
        all(bob.messagesByType('pub'), function (err, ary) {
          if(err) throw err
          t.equal(ary.length, 1)

          console.log(ary)
          t.deepEqual({
            type: 'pub',
            address: ref.parseAddress(alice.address().split(';').shift()),
          }, ary[0].value.content)

          all(bob.messagesByType('contact'), function (err, ary) {
            if(err) throw err

            console.log(ary)
            t.equal(ary.length, 1)

            t.deepEqual({
              type: 'contact',
              contact: alice.id,
              autofollow: true,
              following: true,
            }, ary[0].value.content)


            bob.invite.accept(invite, function (err) {
              t.ok(err)
              alice.friends.hops(alice.id, function (err, hops) {
                console.log(hops)
                t.equal(hops[bob.id], 1)
                alice.close(true)
                bob.close(true)
                t.end()
              })
            })
          })
        })
      })
    })
  })
})

if (process.env.TRAVIS === 'true') {
  console.warn('IPv6 is unsupported under Travis CI, test skipped')
  var skipIPv6 = true
}

tape('test invite.accept api with ipv6', { skip: skipIPv6 }, function (t) {

  var alice = createSsbServer({
    temp: 'test-invite-alice4', timeout: 100,
    allowPrivate: true,
    keys: ssbKeys.generate()
  })

  var bob = createSsbServer({
    temp: 'test-invite-bob4', timeout: 100,
    keys: ssbKeys.generate()
  })

  alice.invite.create(1, function (err, invite) {
    if(err) throw err

    // use a local ipv6 address in the invite

    var inviteV6
        
     = invite.replace(/localhost|([0-9.]*)/, '::1')
    console.log(inviteV6, invite)

    bob.invite.accept(inviteV6, function (err, msg) {
      if(err) throw err
      alice.friends.hops({
        source: alice.id, dest: bob.id
      }, function (err, hops) {
        if(err) throw err
        t.equal(hops[bob.id], 1, 'alice follows bob')
        alice.close(true)
        bob.close(true)
        t.end()
      })
    })
  })

})

tape('test invite.create with modern', function (t) {
  var alice = createSsbServer({
    temp: 'test-invite-alice5', timeout: 100,
    allowPrivate: true,
    keys: ssbKeys.generate(),
    connections: wsConnections
  })

  var bob = createSsbServer({
    temp: 'test-invite-bob5', timeout: 100,
    keys: ssbKeys.generate()
  })

  var carol = createSsbServer({
    temp: 'test-invite-carol5', timeout: 100,
    keys: ssbKeys.generate()
  })

  //request a secret that with particular permissions.

  alice.invite.create({modern: true}, function (err, invite) {
    if(err) throw err
    //test that invite is accepted with quotes around it.
    t.ok(/^ws/.test(invite)) //should be over websockets
    console.log(invite)
    bob.invite.accept(JSON.stringify(invite), function (err, msg) {
      if(err) throw err
      alice.friends.hops({
        source: alice.id, dest: bob.id
      }, function (err, hops) {
        if(err) throw err
        t.equal(hops[bob.id], 1, 'alice follows bob')
        carol.invite.accept(invite, function (err) {
          t.ok(err)
          alice.friends.hops({
            source: alice.id, dest: bob.id
          }, function (err, hops) {
            if(err) throw err
            t.equal(hops[carol.id], undefined)

            console.log("END")
            alice.close(true)
            bob.close(true)
            carol.close(true)

            t.end()
          })
        })
      })
    })
  })
})


tape('test invite.accept doesnt follow if already followed', function (t) {

  var alice = createSsbServer({
    temp: 'test-invite-alice6',
    timeout: 100,
    allowPrivate: true,
    keys: ssbKeys.generate(),
    connections: wsConnections
  })

  alice.publish({type: 'test', okay: true}, function (err, msg) {
    if(err) throw err
    console.log(msg)
    alice.invite.create({modern: true}, function (err, invite) {
      ssbClient(null, {
        remote: invite,
        manifest: {get: 'async', add: 'async'}
      }, function (err, rpc) {
        if(err) throw err
        rpc.get(msg.key, function (err, value) {
          t.ok(err)
          console.log(value)
          t.end()
          alice.close()
        })
      })
    })
  })
})


tape('test invite with note', function (t) {

  var alice = createSsbServer({
    temp: 'test-invite-alice7', timeout: 100,
    allowPrivate: true,
    keys: ssbKeys.generate()
  })

  var bob = createSsbServer({
    temp: 'test-invite-bob7', timeout: 100,
    keys: ssbKeys.generate()
  })

  alice.invite.create({uses:1, note:'bob'}, function (err, invite) {
    if(err) throw err
    bob.invite.accept(invite, function (err) {
      if(err) throw err

      all(alice.messagesByType('contact'), function (err, ary) {
        t.equal(ary.length, 1)

        t.deepEqual({
          type: 'contact',
          contact: bob.id,
          following: true,
          pub: true,
          note: 'bob',
        }, ary[0].value.content)

        alice.close(true)
        bob.close(true)
        t.end()
      })
    })
  })
})


