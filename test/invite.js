var sbot = require('../')
var ssbKeys = require('ssb-keys')
var tape = require('tape')
var explain = require('explain-error')
var pull = require('pull-stream')

tape('test invite api', function (t) {

  var u = require('./util')

  var sbotA = u.createDB('test-invite-alice', {
    port: 45451, host: '127.0.0.1',
    allowPrivate: true
  })

  var alice = sbotA.feed
  var bob = sbotA.ssb.createFeed() //bob

  var server = sbotA.use(require('../plugins/invite')).use(require('../plugins/friends'))

  //request a secret that with particular permissions.

  var manf = server.getManifest()
  var client = sbot.createClient(alice.keys, manf)

  client({port: 45451, host: 'localhost', key: alice.keys.public},
    function (err, aliceC) {
    if(err) throw err

    var signed = ssbKeys.signObj(alice.keys, {
      role: 'client',
      ts: Date.now(),
      public: alice.keys.public
    })

    aliceC.auth(signed, function (err, authed) {
      console.log(err, authed)
      if(err) throw explain(err, 'cannot authorize')
      t.ok(authed.granted)
      aliceC.invite.create(1, function (err, invite) {
        if(err) throw explain(err, 'cannot create invite code')

        var bobC =
          sbot.createClient(bob.keys, manf)
          ({port: 45451, host: 'localhost', key: alice.keys.public},
            function (err, bobC) {

              bobC.auth(ssbKeys.signObj(bob.keys, {
                  role: 'client',
                  ts: Date.now(),
                  public: bob.keys.public
                }), function (err, authed) {
                  if(err) throw explain(err, 'bob cannot auth')

                  var secret = invite.split(',')[2]

                  var hmacd = ssbKeys.signObjHmac(secret, {
                      keyId: ssbKeys.hash(secret, 'base64'),
                      //request must contain your own id,
                      //which prevents this request from being replayed.
                      //because the server checks this the authed user.
                      feed: bob.id,
                      ts: Date.now()
                    })

                  bobC.invite.use(hmacd, function (err, msg) {
                      if(err) throw explain(err, 'bob cannot use invite code')

                    pull(
                      aliceC.feedsLinkedToFeed({id: bob.id, rel: 'contact'}),
                      pull.collect(function (err, ary) {
                        if(err) throw err
                        console.log(ary)

                        var followed = ary[0]
                        delete followed.message

                        t.deepEqual(
                          {source: alice.id, dest: bob.id, rel: 'contact'},
                          ary[0]
                        )
                        console.log('CLOSE')
                        aliceC.close(function () {
                          server.close()
                          t.end()
                        })

                      })
                    )
                  })
              })
            })
      })
    })
  })
})
return
//THIS TEST DISABLED FOR NOW.
//need to rewrite whole invite system.
tape('test invite.addMe api', function (t) {

  var u = require('./util')

  var sbotA = u.createDB('test-invite-alice2', {
    port: 45451, host: '127.0.0.1',
    allowPrivate: true
  })

  var sbotB = u.createDB('test-invite-bob2', {
    port: 45452, host: '127.0.0.1'
  })

  var alice = sbotA.feed
  var bob = sbotA.ssb.createFeed() //bob

  sbotA
    .use(require('../plugins/invite'))
    .use(require('../plugins/friends'))

  sbotB.use(require('../plugins/invite')).use(require('../plugins/friends'))

  //request a secret that with particular permissions.

  sbotA.invite.create(1, function (err, invite) {
    if(err) throw err
    console.log('INVITE', invite)
//    invite.feed = sbotB.feed.id
    return t.end()
    sbotB.invite.addMe(invite, function (err) {
      if(err) throw err
      sbotA.friends.hops(sbotA.feed.id, function (err, hops) {
        console.log(hops)
        t.equal(hops[sbotB.feed.id], 1)
        sbotA.close()
        sbotB.close()
        t.end()
      })
    })
  })
})

