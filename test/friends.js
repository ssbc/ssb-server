var ssbKeys = require('ssb-keys')
var schemas = require('ssb-msg-schemas')
var cont    = require('cont')
var tape    = require('tape')

// create 3 feeds
// add some of friend edges (follow, trust, flag)
// make sure the friends plugin analyzes correctly

tape('construct and analyze graph', function (t) {

  var u = require('./util')

  var server = u.createDB('test-friends1', {
      port: 45451, host: 'localhost', timeout: 1000,
    }).use(require('../plugins/friends'))

  var alice = server.feed
  var bob = server.ssb.createFeed(ssbKeys.generate())
  var carol = server.ssb.createFeed(ssbKeys.generate())

  cont.para([
    cont(schemas.addContact)(server.feed, bob.id,   { following: true, trust: 1 }),
    cont(schemas.addContact)(server.feed, carol.id, { following: true, trust: 0 }),
    cont(schemas.addContact)(bob, alice.id, { following: true, trust: 1 }),
    cont(schemas.addContact)(bob, carol.id, { following: false, trust: -1 }),
    cont(schemas.addContact)(carol, alice.id, { following: true })
  ]) (function () {

    cont.para([
      cont(server.friends.all)(),
      cont(server.friends.all)('follow'),
      cont(server.friends.all)('trust'),

      cont(server.friends.hops)(alice.id),
      cont(server.friends.hops)(alice.id, 'follow'),
      cont(server.friends.hops)(alice.id, 'trust'),

      cont(server.friends.hops)(bob.id, 'follow'),
      cont(server.friends.hops)(bob.id, 'trust'),

      cont(server.friends.hops)(carol.id, 'follow'),
      cont(server.friends.hops)(carol.id, 'trust')
    ], function (err, results) {

      var aliasMap = {}
      aliasMap[alice.id] = 'alice'
      aliasMap[bob.id]   = 'bob'
      aliasMap[carol.id] = 'carol'
      a = toAliases(aliasMap)

      results = results.map(a)
      var i = 0

      t.deepEqual(results[i++], { alice: { bob: true, carol: true }, bob: { alice: true }, carol: { alice: true } })
      t.deepEqual(results[i++], { alice: { bob: true, carol: true }, bob: { alice: true }, carol: { alice: true } })
      t.deepEqual(results[i++], { alice: { bob: 1 }, bob: { alice: 1, carol: -1 }, carol: {} })

      t.deepEqual(results[i++], { alice: 0, bob: 1, carol: 1 })
      t.deepEqual(results[i++], { alice: 0, bob: 1, carol: 1 })
      t.deepEqual(results[i++], { alice: 0, bob: 1, carol: 2 })

      t.deepEqual(results[i++], { bob: 0, alice: 1, carol: 2 })
      t.deepEqual(results[i++], { bob: 0, alice: 1, carol: 1 })

      t.deepEqual(results[i++], { carol: 0, alice: 1, bob: 2 })
      t.deepEqual(results[i++], { carol: 0 })

      t.end()
      server.close()
    })
  })
})

tape('correctly delete edges', function (t) {

  var u = require('./util')

  var server = u.createDB('test-friends2', {
      port: 45451, host: 'localhost', timeout: 1000,
    }).use(require('../plugins/friends'))

  var alice = server.feed
  var bob = server.ssb.createFeed(ssbKeys.generate())
  var carol = server.ssb.createFeed(ssbKeys.generate())

  cont.para([
    cont(schemas.addContact)(server.feed, bob.id,   { following: true, trust: 1 }),
    cont(schemas.addContact)(server.feed, carol.id, { following: true, trust: 0 }),
    cont(schemas.addContact)(bob, alice.id, { following: true,  trust: 1 }),
    cont(schemas.addContact)(bob, carol.id, { following: false, trust: -1 }),
    cont(schemas.addContact)(carol, alice.id, { following: true }),

    cont(schemas.addContact)(server.feed, carol.id, { following: false, trust: 0 }),
    cont(schemas.addContact)(server.feed, bob.id,   { following: true,  trust: 0 }),
    cont(schemas.addContact)(bob, carol.id, { following: false, trust: 0 })
  ]) (function () {

    cont.para([
      cont(server.friends.all)('follow'),
      cont(server.friends.all)('trust'),

      cont(server.friends.hops)(alice.id, 'follow'),
      cont(server.friends.hops)(alice.id, 'trust'),

      cont(server.friends.hops)(bob.id, 'follow'),
      cont(server.friends.hops)(bob.id, 'trust'),

      cont(server.friends.hops)(carol.id, 'follow'),
      cont(server.friends.hops)(carol.id, 'trust')
    ], function (err, results) {

      var aliasMap = {}
      aliasMap[alice.id] = 'alice'
      aliasMap[bob.id]   = 'bob'
      aliasMap[carol.id] = 'carol'
      a = toAliases(aliasMap)

      results = results.map(a)
      var i = 0

      t.deepEqual(results[i++], { alice: { bob: true }, bob: { alice: true }, carol: { alice: true } })
      t.deepEqual(results[i++],  { alice: {}, bob: { alice: 1 }, carol: {} })

      t.deepEqual(results[i++], { alice: 0, bob: 1 })
      t.deepEqual(results[i++], { alice: 0 })

      t.deepEqual(results[i++], { bob: 0, alice: 1 })
      t.deepEqual(results[i++], { bob: 0, alice: 1 })

      t.deepEqual(results[i++], { carol: 0, alice: 1, bob: 2 })
      t.deepEqual(results[i++], { carol: 0 })

      t.end()
      server.close()
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