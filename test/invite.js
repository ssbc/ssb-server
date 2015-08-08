var sbot = require('../')
var ssbKeys = require('ssb-keys')
var tape = require('tape')
var explain = require('explain-error')
var pull = require('pull-stream')
var u = require('../lib/util')

var createSbot = require('../')
  .use(require('../plugins/master'))
  .use(require('../plugins/invite'))
  .use(require('../plugins/friends'))

function all(stream, cb) {
  return pull(stream, pull.collect(cb))
}

tape('test invite api', function (t) {

  var aliceKeys = ssbKeys.generate()

  var alice = createSbot({
    temp: 'test-invite-alice', timeout: 200,
    allowPrivate: true,
    keys: aliceKeys
  })

  var bobKeys = ssbKeys.generate()
  var bob = alice.createFeed(bobKeys) //bob

  //request a secret that with particular permissions.

  createSbot.createClient({keys: aliceKeys})
  (alice.getAddress(), function (err, rpc) {
    if(err) throw err

    rpc.invite.create(1, function (err, invite) {
      if(err) throw explain(err, 'cannot create invite code')

      var parts = invite.split('~')
      console.log(parts)
      createSbot.createClient({seed: parts[1]})
      (parts[0], function (err, rpc2) {
        if(err) throw err

        rpc2.invite.use({
          feed: bob.id
        }, function (err, msg) {
            if(err) throw explain(err, 'bob cannot use invite code')

          pull(
            rpc.links({dest: bob.id, rel: 'contact', source: '@', keys: false}),
            pull.collect(function (err, ary) {
              if(err) throw err

              var followed = ary[0]
              delete followed.message

              t.deepEqual(
                ary[0],
                {source: alice.id, dest: bob.id, rel: 'contact'}
              )

              alice.close(true)
              console.log('done')
              t.end()

            })
          )
        })
      })
    })
  })
})

tape('test invite.accept api', function (t) {

  var alice = createSbot({
    temp: 'test-invite-alice2', timeout: 100,
    allowPrivate: true,
    keys: ssbKeys.generate()
  })

  var bob = createSbot({
    temp: 'test-invite-bob2', timeout: 100,
    keys: ssbKeys.generate()
  })

  //request a secret that with particular permissions.

  alice.invite.create(1, function (err, invite) {
    if(err) throw err
    bob.invite.accept(invite, function (err) {
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

tape('test invite.accept doesnt follow if already followed', function (t) {

  var alice = createSbot({
    temp: 'test-invite-alice3',
    timeout: 100,
    allowPrivate: true,
    keys: ssbKeys.generate()
  })

  var bob = createSbot({
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

          t.deepEqual({
            type: 'pub',
            address: u.toAddress(alice.address()),
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
