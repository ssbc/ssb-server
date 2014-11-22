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
  var server = sbot({port: 1234, host: 'localhost', pass: 'foo'}, db, feed)
  var client = sbot.createClient({port: 1234, host: 'localhost'})

  var signed = seal.sign(feed.keys, {
    role: 'client',
    ts: Date.now(),
    public: feed.keys.public
  })

  client.auth(signed, function(err) {
    if (err) throw err
  
    client.follow(bob.id, function(err, msg) {
      if (err) throw err
      
      client.isFollowing(bob.id, function(err, isFollowing) {
        if (err) throw err
        t.equal(isFollowing, true)

        client.isFollowing(alice.id, function(err, isFollowing) {
          if (err) throw err
          t.equal(isFollowing, false)

          pull(client.followedUsers(), pull.collect(function(err, users) {
            if (err) throw err
            t.equal(users.length, 1)
            t.equal(users[0].toString('base64'), bob.id.toString('base64'))

            client.unfollow(bob.id, function(err) {
              if (err) throw err

              client.isFollowing(bob.id, function(err, isFollowing) {
                if (err) throw err
                t.equal(isFollowing, false)
                t.end()
                client.close(console.log)
                server.close()
              })
            })
          }))
        })
      })
    })
  })
})
