
var sbot = require('../')
var ssbKeys = require('ssb-keys')
var tape = require('tape')
var explain = require('explain-error')
var pull = require('pull-stream')

tape('test api', function (t) {

  var u = require('./util')

  var sbotA = u.createDB('test-invite-alice', {
    port: 45451, host: '127.0.0.1'
  })
  var alice = sbotA.feed
  var bob = sbotA.ssb.createFeed() //bob

  var server = sbotA.use(require('../plugins/invite'))

  //request a secret that with particular permissions.

  var manf = server.getManifest()
  var client = sbot.createClient({port: 45451, host: 'localhost'}, manf)

  var signed = ssbKeys.signObj(alice.keys, {
    role: 'client',
    ts: Date.now(),
    public: alice.keys.public
  })

  client.auth(signed, function (err, authed) {
    console.log(err, authed)
    if(err) throw explain(err, 'cannot authorize')
    t.ok(authed.granted)
    client.invite.create(1, function (err, invite) {
      if(err) throw explain(err, 'cannot create invite code')

      var bobC =
        sbot.createClient({port: 45451, host: 'localhost'}, manf)

      bobC.auth(ssbKeys.signObj(bob.keys, {
          role: 'client',
          ts: Date.now(),
          public: bob.keys.public
        }), function (err, authed) {
          if(err) throw explain(err, 'bob cannot auth')

          var hmacd = ssbKeys.signObjHmac(invite.secret, {
              keyId: ssbKeys.hash(invite.secret, 'base64'),
              //request must contain your own id,
              //which prevents this request from being replayed.
              //because the server checks this the authed user.
              feed: bob.id,
              ts: Date.now()
            })

          bobC.invite.use(hmacd, function (err, msg) {
              if(err) throw explain(err, 'bob cannot use invite code')

            pull(
              client.feedsLinkedToFeed({id: bob.id, rel: 'follows'}),
              pull.collect(function (err, ary) {
                if(err) throw err
                console.log(ary)

                var followed = ary[0]
                delete followed.message

                t.deepEqual(
                  {source: alice.id, dest: bob.id, rel: 'follows'},
                  ary[0]
                )

                client.close(function () {
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


