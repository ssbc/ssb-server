var ssbKeys = require('ssb-keys')
var cont    = require('cont')
var tape    = require('tape')
var u       = require('./util')
var pull    = require('pull-stream')

//THERE IS NO TEST COVERAGE FOR LIVE STREAMS!

// create 3 feeds
// add some of friend edges (follow, flag)
// make sure the friends plugin analyzes correctly

var createSsbServer = require('../')
  .use(require('../plugins/replicate'))
  .use(require('ssb-friends'))


function sort (ary) {
  return ary.sort(function (a, b) {
    return a.id < b.id ? -1 : a.id === b.id ? 1 : 0
  })
}

function toAliases(aliasMap) {
  return function (g) {
    var g_ = {}
    for (var k in g) {
      var k_ = aliasMap[k]
      if (typeof g[k] == 'object') {
        g_[k_] = {}
        for (var l in g[k]) {
          var l_ = aliasMap[l]
          g_[k_][l_] = g[k][l]
        }
      } else {
        g_[k_] = g[k]
      }
    }
    return g_
  }
}

function liveFriends(ssbServer) {
  var live = {}
  pull(
    ssbServer.friends.createFriendStream({live: true, meta: true}),
    pull.drain(function (friend) {
      if(friend.sync) return
      live[friend.id] = friend.hops
    })
  )
  return live
}

tape('construct and analyze graph', function (t) {

  var aliceKeys = ssbKeys.generate()

  var ssbServer = createSsbServer({
      temp:'test-friends1',
      port: 45451, host: 'localhost', timeout: 1000,
      keys: aliceKeys
    })

  var alice = ssbServer.createFeed(aliceKeys)
  var bob = ssbServer.createFeed()
  var carol = ssbServer.createFeed()

  t.test('add friends, and retrive all friends for a peer', function (t) {
    var live = liveFriends(ssbServer)

    cont.para([
      alice.add({
        type: 'contact', contact: bob.id,
        following: true,
        flagged: { reason: 'foo' }
      }),
      alice.add(u.follow(carol.id)),
      bob.add(u.follow(alice.id)),
      bob.add({
        type: 'contact', contact: carol.id,
        following: false, flagged: true
      }),
      carol.add(u.follow(alice.id))
    ]) (function (err, results) {
      if(err) throw err
      ssbServer.friends.hops(function (err, hops) {
        if(err) throw err
        t.deepEqual(live, hops)
        t.end()
      })
    })
  })

  t.test('creatFriendStream', function () {
    pull(
      ssbServer.friends.createFriendStream(),
      pull.collect(function (err, ary) {
        t.notOk(err)
        t.equal(ary.length, 2)
        t.deepEqual(ary.sort(), [alice.id, carol.id].sort())
        t.end()
      })
    )
  })

  t.test('creatFriendStream - meta', function (t) {
    pull(
      ssbServer.friends.createFriendStream({meta: true}),
      pull.collect(function (err, ary) {
        t.notOk(err)
        t.equal(ary.length, 2)
        t.deepEqual(sort(ary), sort([
          {id: alice.id, hops: 0},
          {id: carol.id, hops: 1}
        ]))

        t.end()
      })
    )
  })

  t.test('cleanup', function (t) {
    ssbServer.close()
    t.end()
  })

})

tape('correctly delete edges', function (t) {
  //XXX
  //return t.end()
  var aliceKeys = ssbKeys.generate()

  var ssbServer = createSsbServer({
      temp:'test-friends2',
      port: 45452, host: 'localhost', timeout: 1000,
      keys: aliceKeys
    })

  var alice = ssbServer.createFeed(aliceKeys)
  var bob   = ssbServer.createFeed()
  var carol = ssbServer.createFeed()

  var live = liveFriends(ssbServer)

  t.test('add and delete', function (t) {

    cont.para([
      alice.add({
        type:'contact', contact:bob.id,
        following: true, flagged: true
      }),
      alice.add(u.follow(carol.id)),
      bob.add(u.follow(alice.id)),
      bob.add({
        type: 'contact', contact: carol.id,
        following: false, flagged: { reason: 'foo' }
      }),
      carol.add(u.follow(alice.id)),
      alice.add({
        type:'contact', contact: carol.id,
        following: false,  flagged: true
      }),
      alice.add({
        type:'contact', contact: bob.id,
        following: true,  flagged: false
      }),
      bob.add(u.unfollow(carol.id))
    ]) (function () {
      ssbServer.friends.hops(function (err, hops) {
        if(err) throw err
        t.deepEqual(live, hops)
        t.end()
      })
    })
  })

  t.test('createFriendStream after delete', function (t) {
    pull(
      ssbServer.friends.createFriendStream(),
      pull.collect(function (err, ary) {
        t.notOk(err)
        t.equal(ary.length, 2)
        t.deepEqual(ary.sort(), [alice.id, bob.id].sort())
        t.end()
      })
    )
  })

  t.test('cleanup', function (t) {
    ssbServer.close()

    t.end()
  })

})

tape('indirect friends', function (t) {

  var aliceKeys = ssbKeys.generate()

  var ssbServer = createSsbServer({
      temp:'test-friends3',
      port: 45453, host: 'localhost', timeout: 1000,
      keys: aliceKeys
    })

  var alice = ssbServer.createFeed(aliceKeys)
  var bob   = ssbServer.createFeed()
  var carol = ssbServer.createFeed()
  var dan   = ssbServer.createFeed()

  var live = liveFriends(ssbServer)

  t.test('chain of friends', function (t) {
    cont.para([
      alice.add(u.follow(bob.id)),
      bob.add(u.follow(carol.id)),
      carol.add(u.follow(dan.id))
    ]) (function (err, results) {
      if(err) throw err

      ssbServer.friends.hops({hops: 3}, function (err, all) {
        if(err) throw err
        var o = {}

        o[alice.id] = 0
        o[bob.id]   = 1
        o[carol.id] = 2
        o[dan.id]   = 3

        t.deepEqual(all, o)

        t.deepEqual(live, o)

        t.end()
      })
    })
  })

  var expected = [
    {id: alice.id, hops: 0},
    {id: bob.id, hops: 1},
    {id: carol.id, hops: 2},
    {id: dan.id, hops: 3}
  ]

  t.test('createFriendStream on long chain', function (t) {

    pull(
      ssbServer.friends.createFriendStream(),
      pull.collect(function (err, ary) {
        if(err) throw err
        t.deepEqual(ary, expected.map(function (e) { return e.id }))
        t.end()
      })
    )

  })

  t.test('creatFriendStream - meta', function (t) {

    pull(
      ssbServer.friends.createFriendStream({meta: true}),
      pull.collect(function (err, ary) {
        t.notOk(err)

        t.equal(ary.length, 4)
        t.deepEqual(sort(ary), sort(expected))

        t.end()
      })
    )

  })


  t.test('cleanup', function (t) {
    ssbServer.close()
    t.end()
  })

})


