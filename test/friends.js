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
    cont(schemas.addFollow)(server.feed, bob.id),
    cont(schemas.addFollow)(server.feed, carol.id),
    cont(schemas.addTrust)(server.feed, bob.id, 1),

    cont(schemas.addFollow)(bob, alice.id),
    cont(schemas.addTrust)(bob, alice.id, 1),
    cont(schemas.addTrust)(bob, carol.id, -1),

    cont(schemas.addFollow)(carol, alice.id)
  ]) (function () {

    // kludge!
    // have to wait a bit for the friends plugin to do its indexing (last messages are missed sometimes if we dont wait)
    // feel free to improve
    setTimeout(next, 500)

    function next() {
      var aliasMap = {}
      aliasMap[alice.id] = 'alice'
      aliasMap[bob.id]   = 'bob'
      aliasMap[carol.id] = 'carol'
      a = toAliases(aliasMap)

      t.deepEqual(a(server.friends.all()),         { alice: { bob: true, carol: true }, bob: { alice: true }, carol: { alice: true } })
      t.deepEqual(a(server.friends.all('follow')), { alice: { bob: true, carol: true }, bob: { alice: true }, carol: { alice: true } })
      t.deepEqual(a(server.friends.all('trust')),  { alice: { bob: 1 }, bob: { alice: 1, carol: -1 }, carol: {} })

      t.deepEqual(a(server.friends.hops(alice.id)), { alice: 0, bob: 1, carol: 1 })
      t.deepEqual(a(server.friends.hops(alice.id, 'follow')), { alice: 0, bob: 1, carol: 1 })
      t.deepEqual(a(server.friends.hops(alice.id, 'trust')), { alice: 0, bob: 1, carol: 2 })

      t.deepEqual(a(server.friends.hops(bob.id, 'follow')), { bob: 0, alice: 1, carol: 2 })
      t.deepEqual(a(server.friends.hops(bob.id, 'trust')), { bob: 0, alice: 1, carol: 1 })

      t.deepEqual(a(server.friends.hops(carol.id, 'follow')), { carol: 0, alice: 1, bob: 2 })
      t.deepEqual(a(server.friends.hops(carol.id, 'trust')), { carol: 0 })

      t.end()
      server.close()
    }
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
    cont(schemas.addFollow)(server.feed, bob.id),
    cont(schemas.addFollow)(server.feed, carol.id),
    cont(schemas.addTrust)(server.feed, bob.id, 1),

    cont(schemas.addFollow)(bob, alice.id),
    cont(schemas.addTrust)(bob, alice.id, 1),
    cont(schemas.addTrust)(bob, carol.id, -1),

    cont(schemas.addFollow)(carol, alice.id),

    cont(schemas.addUnfollow)(server.feed, carol.id),
    cont(schemas.addTrust)(server.feed, bob.id, 0),
    cont(schemas.addTrust)(bob, carol.id, 0)
  ]) (function () {

    // kludge!
    // have to wait a bit for the friends plugin to do its indexing (last messages are missed sometimes if we dont wait)
    // feel free to improve
    setTimeout(next, 500)

    function next() {
      var aliasMap = {}
      aliasMap[alice.id] = 'alice'
      aliasMap[bob.id]   = 'bob'
      aliasMap[carol.id] = 'carol'
      a = toAliases(aliasMap)

      t.deepEqual(a(server.friends.all('follow')), { alice: { bob: true }, bob: { alice: true }, carol: { alice: true } })
      t.deepEqual(a(server.friends.all('trust')),  { alice: {}, bob: { alice: 1 }, carol: {} })

      t.deepEqual(a(server.friends.hops(alice.id, 'follow')), { alice: 0, bob: 1 })
      t.deepEqual(a(server.friends.hops(alice.id, 'trust')), { alice: 0 })

      t.deepEqual(a(server.friends.hops(bob.id, 'follow')), { bob: 0, alice: 1 })
      t.deepEqual(a(server.friends.hops(bob.id, 'trust')), { bob: 0, alice: 1 })

      t.deepEqual(a(server.friends.hops(carol.id, 'follow')), { carol: 0, alice: 1, bob: 2 })
      t.deepEqual(a(server.friends.hops(carol.id, 'trust')), { carol: 0 })

      t.end()
      server.close()
    }
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