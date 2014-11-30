var tape = require('tape')
var pull = require('pull-stream')
var sbot = require('../')
var seal = require('../lib/seal')(require('ssb-keys'))

tape('follow, isFollowing, followedUsers, unfollow', function (t) {
  var u = require('./util')

  var dbAlice = u.createDB('followtest-alice')
  var alice = dbAlice.createFeed()

  var dbBob = u.createDB('followtest-bob')
  var bob = dbBob.createFeed()

  var db = u.createDB('feed-test')
  var feed = db.createFeed()
  var server = sbot({port: 1234, host: 'localhost'}, db, feed)
    .use(require('../plugins/easy'))

  console.log(server.getManifest())

  var client = sbot.createClient(
    {port: 1234, host: 'localhost'},
    server.getManifest()
  )

  var signed = seal.sign(feed.keys, {
    role: 'client',
    ts: Date.now(),
    public: feed.keys.public
  })

  client.auth(signed, function(err) {
    if (err) throw err

    client.easy.follow(bob.id, function(err, msg) {
      if (err) throw err

      client.easy.isFollowing(bob.id, function(err, isFollowing) {
        if (err) throw err
        t.equal(isFollowing, true)

        client.easy.isFollowing(alice.id, function(err, isFollowing) {
          if (err) throw err
          t.equal(isFollowing, false)

          pull(client.easy.followedUsers(), pull.collect(function(err, users) {
            if (err) throw err
            t.equal(users.length, 1)
            t.equal(users[0].toString('base64'), bob.id.toString('base64'))

            // client.unfollow(bob.id, function(err) {
            //   if (err) throw err

            //   client.isFollowing(bob.id, function(err, isFollowing) {
            //     if (err) throw err
            //     t.equal(isFollowing, false)

                client.close(function() {
                  t.end()
                  server.close()
                })
              // })
            // })
          }))
        })
      })
    })
  })
})
