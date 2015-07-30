var ssbKeys = require('ssb-keys')
var cont    = require('cont')
var tape    = require('tape')
var u       = require('./util')
// create 3 feeds
// add some of friend edges (follow, flag)
// make sure the friends plugin analyzes correctly

var createSbot = require('../')
  .use(require('../plugins/friends'))

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

    cont.para([
      cont(sbot.friends.all)(),
      cont(sbot.friends.all)('follow'),
      cont(sbot.friends.all)('flag'),

      cont(sbot.friends.hops)(alice.id),
      cont(sbot.friends.hops)(alice.id, 'follow'),
      cont(sbot.friends.hops)(alice.id, 'flag'),

      cont(sbot.friends.hops)(bob.id, 'follow'),
      cont(sbot.friends.hops)(bob.id, 'flag'),

      cont(sbot.friends.hops)(carol.id, 'follow'),
      cont(sbot.friends.hops)(carol.id, 'flag')
    ], function (err, results) {
      if(err) throw err

      var aliasMap = {}
      aliasMap[alice.id] = 'alice'
      aliasMap[bob.id]   = 'bob'
      aliasMap[carol.id] = 'carol'

      a = toAliases(aliasMap)

      results = results.map(a)
      var i = 0

      t.deepEqual(results[i++], { alice: { bob: true, carol: true }, bob: { alice: true }, carol: { alice: true } })
      t.deepEqual(results[i++], { alice: { bob: true, carol: true }, bob: { alice: true }, carol: { alice: true } })
      t.deepEqual(results[i++], { alice: { bob: { reason: 'foo' } }, bob: { carol: true }, carol: {} })

      t.deepEqual(results[i++], { alice: 0, bob: 1, carol: 1 })
      t.deepEqual(results[i++], { alice: 0, bob: 1, carol: 1 })
      t.deepEqual(results[i++], { alice: 0, bob: 1, carol: 2 })

      t.deepEqual(results[i++], { bob: 0, alice: 1, carol: 2 })
      t.deepEqual(results[i++], { bob: 0, carol: 1 })

      t.deepEqual(results[i++], { carol: 0, alice: 1, bob: 2 })
      t.deepEqual(results[i++], { carol: 0 })

      t.end()
      sbot.close()
    })
  })
})

tape('correctly delete edges', function (t) {

  var aliceKeys = ssbKeys.generate()

  var sbot = createSbot({
      temp:'test-friends2',
      port: 45451, host: 'localhost', timeout: 1000,
      keys: aliceKeys
    })

  var alice = sbot.createFeed(aliceKeys)
  var bob   = sbot.createFeed()
  var carol = sbot.createFeed()

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

    cont.para([
      cont(sbot.friends.all)('follow'),
      cont(sbot.friends.all)('flag'),

      cont(sbot.friends.hops)(alice.id, 'follow'),
      cont(sbot.friends.hops)(alice.id, 'flag'),

      cont(sbot.friends.hops)(bob.id, 'follow'),
      cont(sbot.friends.hops)(bob.id, 'flag'),

      cont(sbot.friends.hops)(carol.id, 'follow'),
      cont(sbot.friends.hops)(carol.id, 'flag')
    ], function (err, results) {

      var aliasMap = {}
      aliasMap[alice.id] = 'alice'
      aliasMap[bob.id]   = 'bob'
      aliasMap[carol.id] = 'carol'
      a = toAliases(aliasMap)

      results = results.map(a)
      var i = 0

      t.deepEqual(results[i++], { alice: { bob: true }, bob: { alice: true }, carol: { alice: true } })
      t.deepEqual(results[i++],  { alice: { carol: true }, bob: { carol: { reason: 'foo' }}, carol: {} })

      t.deepEqual(results[i++], { alice: 0, bob: 1 })
      t.deepEqual(results[i++], { alice: 0, carol: 1 })

      t.deepEqual(results[i++], { bob: 0, alice: 1 })
      t.deepEqual(results[i++], { bob: 0, carol: 1 })

      t.deepEqual(results[i++], { carol: 0, alice: 1, bob: 2 })
      t.deepEqual(results[i++], { carol: 0 })

      t.end()
      sbot.close()
    })
  })
})

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
