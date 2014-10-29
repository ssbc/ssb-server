var tape = require('tape')
var pull = require('pull-stream')
var rimraf = require('rimraf')
var sbot = require('../lib')

var dbpath = require('path').join(__dirname, '.db')
try { rimraf.sync(dbpath) } catch(e) { console.log(e) }

tape('follow, isFollowing, followedUsers, unfollow', function (t) {
  var bob = '5f3eac42ae28da590889f68c9de75e3bf2c1194c8a6257a020a05b2bf42742de'
  var alice = '75e3bf2c1194c8a6257a020a05b2bf42742de5f3eac42ae28da590889f68c9de'
  var server = sbot.serve(1234, __dirname)
  var client = sbot.connect(1234)

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
              client.socket.end()
              server.close()
            })
          })
        }))
      })
    })
  })
})
