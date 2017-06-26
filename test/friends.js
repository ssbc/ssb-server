var ssbKeys = require('ssb-keys')
var cont    = require('cont')
var tape    = require('tape')
var u       = require('./util')
var pull    = require('pull-stream')

//THERE IS NO TEST COVERAGE FOR LIVE STREAMS!

// create 3 feeds
// add some of friend edges (follow, flag)
// make sure the friends plugin analyzes correctly

var createSbot = require('../')
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

function liveFriends(sbot) {
  var live = {}
  pull(
    sbot.friends.createFriendStream({live: true, meta: true}),
    pull.drain(function (friend) {
      if(friend.sync) return
      live[friend.id] = friend.hops
    })
  )
  return live
}

tape('construct and analyze graph', function (t) {

  var aliceKeys = ssbKeys.generate()

  var sbot = createSbot({
      temp:'test-friends1',
      port: 45451, host: 'localhost', timeout: 1000,
      keys: aliceKeys
    })

  var alice = sbot.createFeed(aliceKeys)
  var bob = sbot.createFeed()
  var carol = sbot.createFeed()

  t.test('add friends, and retrive all friends for a peer', function (t) {
    var live = liveFriends(sbot)

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

      console.log(live)
      sbot.friends.hops(function (err, hops) {
        if(err) throw err
        t.deepEqual(live, hops)
        t.end()
      })

//      cont.para([
//        cont(sbot.friends.all)(),
//        cont(sbot.friends.all)('follow'),
//        cont(sbot.friends.all)('flag'),
//
//        cont(sbot.friends.hops)(alice.id),
//        cont(sbot.friends.hops)(alice.id, 'follow'),
//        cont(sbot.friends.hops)(alice.id, 'flag'),
//
//        cont(sbot.friends.hops)(bob.id, 'follow'),
//        cont(sbot.friends.hops)(bob.id, 'flag'),
//
//        cont(sbot.friends.hops)(carol.id, 'follow'),
//        cont(sbot.friends.hops)(carol.id, 'flag')
//      ], function (err, results) {
//        if(err) throw err
//
//        var aliasMap = {}
//        aliasMap[alice.id] = 'alice'
//        aliasMap[bob.id]   = 'bob'
//        aliasMap[carol.id] = 'carol'
//
//        a = toAliases(aliasMap)
//
//        results = results.map(a)
//        var i = 0
//
//        t.deepEqual(results[i++], { alice: { bob: true, carol: true }, bob: { alice: true }, carol: { alice: true } })
//        t.deepEqual(results[i++], { alice: { bob: true, carol: true }, bob: { alice: true }, carol: { alice: true } })
//        t.deepEqual(results[i++], { alice: { bob: { reason: 'foo' } }, bob: { carol: true }, carol: {} })
//
//        t.deepEqual(results[i++], { alice: 0, bob: 1, carol: 1 })
//        t.deepEqual(results[i++], { alice: 0, bob: 1, carol: 1 })
//        t.deepEqual(results[i++], { alice: 0, bob: 1, carol: 2 })
//
//        t.deepEqual(results[i++], { bob: 0, alice: 1, carol: 2 })
//        t.deepEqual(results[i++], { bob: 0, carol: 1 })
//
//        t.deepEqual(results[i++], { carol: 0, alice: 1, bob: 2 })
//        t.deepEqual(results[i++], { carol: 0 })
//
//        t.end()
//      })
    })
  })

  t.test('creatFriendStream', function () {
    pull(
      sbot.friends.createFriendStream(),
      pull.collect(function (err, ary) {
        t.notOk(err)
        t.equal(ary.length, 3)
        t.deepEqual(ary.sort(), [alice.id, bob.id, carol.id].sort())
        t.end()
      })
    )
  })

  t.test('creatFriendStream - meta', function (t) {
    pull(
      sbot.friends.createFriendStream({meta: true}),
      pull.collect(function (err, ary) {
        t.notOk(err)
        t.equal(ary.length, 3)
        t.deepEqual(sort(ary), sort([
          {id: alice.id, hops: 0},
          {id: bob.id, hops: 1},
          {id: carol.id, hops: 1}
        ]))

        t.end()
      })
    )
  })

  t.test('cleanup', function (t) {
    sbot.close()
    t.end()
  })

})

tape('correctly delete edges', function (t) {
  //XXX
  return t.end()
  var aliceKeys = ssbKeys.generate()

  var sbot = createSbot({
      temp:'test-friends2',
      port: 45452, host: 'localhost', timeout: 1000,
      keys: aliceKeys
    })

  var alice = sbot.createFeed(aliceKeys)
  var bob   = sbot.createFeed()
  var carol = sbot.createFeed()

  var live = liveFriends(sbot)

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

//      cont.para([
//        cont(sbot.friends.all)('follow'),
//        cont(sbot.friends.all)('flag'),
//
//        cont(sbot.friends.hops)(alice.id, 'follow'),
//        cont(sbot.friends.hops)(alice.id, 'flag'),
//
//        cont(sbot.friends.hops)(bob.id, 'follow'),
//        cont(sbot.friends.hops)(bob.id, 'flag'),
//
//        cont(sbot.friends.hops)(carol.id, 'follow'),
//        cont(sbot.friends.hops)(carol.id, 'flag')
//      ], function (err, results) {
//
//        var aliasMap = {}
//        aliasMap[alice.id] = 'alice'
//        aliasMap[bob.id]   = 'bob'
//        aliasMap[carol.id] = 'carol'
//        a = toAliases(aliasMap)
//
//        results = results.map(a)
//        var i = 0
//
//        t.deepEqual(results[i++], { alice: { bob: true }, bob: { alice: true }, carol: { alice: true } })
//        t.deepEqual(results[i++],  { alice: { carol: true }, bob: { carol: { reason: 'foo' }}, carol: {} })
//
//        t.deepEqual(results[i++], { alice: 0, bob: 1 })
//        t.deepEqual(results[i++], { alice: 0, carol: 1 })
//
//        t.deepEqual(results[i++], { bob: 0, alice: 1 })
//        t.deepEqual(results[i++], { bob: 0, carol: 1 })
//
//        t.deepEqual(results[i++], { carol: 0, alice: 1, bob: 2 })
//        t.deepEqual(results[i++], { carol: 0 })
//
//        t.end()
//      })
    })
  })

  t.test('createFriendStream after delete', function (t) {
    pull(
      sbot.friends.createFriendStream(),
      pull.collect(function (err, ary) {
        t.notOk(err)
        t.equal(ary.length, 2)
        t.deepEqual(ary.sort(), [alice.id, bob.id].sort())
        t.end()
      })
    )
  })

  t.test('cleanup', function (t) {
    sbot.close()
    t.end()
  })

})

tape('indirect friends', function (t) {

  var aliceKeys = ssbKeys.generate()

  var sbot = createSbot({
      temp:'test-friends3',
      port: 45453, host: 'localhost', timeout: 1000,
      keys: aliceKeys
    })

  var alice = sbot.createFeed(aliceKeys)
  var bob   = sbot.createFeed()
  var carol = sbot.createFeed()
  var dan   = sbot.createFeed()

  var live = liveFriends(sbot)

  t.test('chain of friends', function (t) {
    cont.para([
      alice.add(u.follow(bob.id)),
      bob.add(u.follow(carol.id)),
      carol.add(u.follow(dan.id))
    ]) (function (err, results) {
      if(err) throw err

      sbot.friends.hops({hops: 3}, function (err, all) {
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
      sbot.friends.createFriendStream(),
      pull.collect(function (err, ary) {
        if(err) throw err
        t.deepEqual(ary, expected.map(function (e) { return e.id }))
        t.end()
      })
    )

  })

  t.test('creatFriendStream - meta', function (t) {

    pull(
      sbot.friends.createFriendStream({meta: true}),
      pull.collect(function (err, ary) {
        t.notOk(err)

        t.equal(ary.length, 4)
        t.deepEqual(sort(ary), sort(expected))

        t.end()
      })
    )

  })


  t.test('cleanup', function (t) {
    sbot.close()
    t.end()
  })

})


