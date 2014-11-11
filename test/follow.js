var tape = require('tape')
var pull = require('pull-stream')
var sbot = require('../')

tape('follow, isFollowing, followedUsers, unfollow', function (t) {
  var u = require('./util')
  var bob = '5f3eac42ae28da590889f68c9de75e3bf2c1194c8a6257a020a05b2bf42742de'
  var alice = '75e3bf2c1194c8a6257a020a05b2bf42742de5f3eac42ae28da590889f68c9de'

  var db = u.createDB('feed-test')
  var feed = db.createFeed()
  var server = sbot({port: 1234, host: 'localhost', pass: 'foo'}, db, feed)
  var client = sbot.connect({port: 1234, host: 'localhost'})

  client.auth('foo', function(err) {
    if (err) throw err
  
    client.follow(bob, function(err) {
      if (err) throw err
      
      client.isFollowing(bob, function(err, isFollowing) {
        if (err) throw err
        t.equal(isFollowing, true)

        client.isFollowing(alice, function(err, isFollowing) {
          if (err) throw err
          t.equal(isFollowing, false)

          pull(client.followedUsers(), pull.collect(function(err, users) {
            if (err) throw err
            t.equal(users.length, 1)
            t.equal(users[0].toString('hex'), bob)

            client.unfollow(bob, function(err) {
              if (err) throw err

              client.isFollowing(bob, function(err, isFollowing) {
                if (err) throw err
                t.equal(isFollowing, false)
                t.end()
                client.close()
                server.close()
              })
            })
          }))
        })
      })
    })
  })
})
