var pull = require('pull-stream')
var paramap = require('pull-paramap')
var ssbKeys = require('ssb-keys')
var u = require('./util')

var tape = require('tape')

var cats = require('cat-names')
var dogs = require('dog-names')

var generated = {}; var F = 100; var N = 10000

function isNumber (n) {
  return typeof n === 'number'
}

function once (fn) {
  var called = false
  return function () {
    if (called) throw new Error('called twice!')
    called = true
    fn.apply(this, arguments)
  }
}

var createSbot = require('../')
  .use(require('../plugins/replicate'))
  .use(require('ssb-friends'))
  .use(require('ssb-ebt'))
  .use(require('../plugins/gossip'))

function generateAnimals (sbot, feed, f, n, cb) {
  var a = [feed]

  while (f-- > 0) { a.push(sbot.createFeed()) }

  console.log('generate NAMES')

  pull(
    pull.values(a),
    paramap(function (feed, cb) {
      var animal = Math.random() > 0.5 ? 'cat' : 'dog'
      var name = animal === 'cat' ? cats.random() : dogs.allRandom()

      feed.name = name
      feed.add(u.follow(feed.id), cb)
    }, 10),
    pull.drain(null, function (err) {
      if (err) return cb(err)

      var posts = []

      pull(
        pull.count(n),
        paramap(function (n, cb) {
          var me = a[~~(Math.random() * a.length)]
          var r = Math.random()

          // one in 20 messages is a random follow
          if (r < 0.5) {
            var f = a[~~(Math.random() * a.length)]
            me.add(u.follow(f.id), cb)
          } else if (r < 0.6) {
            me.add({
              type: 'post',
              text: me.animal === 'dog' ? 'woof' : 'meow'
            }, function (err, msg) {
              if (err) throw err
              posts.push(msg.key)
              if (posts.length > 100) { posts.shift() }
              cb(null, msg)
            })
          } else {
            var post = posts[~~(Math.random() * posts.length)]
            me.add({
              type: 'post',
              repliesTo: post,
              text: me.animal === 'dog' ? 'woof woof' : 'purr'
            }, function (err, msg) {
              if (err) throw err
              cb(null, msg)
            })
          }
        }, 32),
        pull.drain(null, cb)
      )
    })
  )
}

function latest (sbot, cb) {
  sbot.friends.hops({ hops: 3 }, once(function (err, keys) {
    if (err) return cb(err)
    var n = Object.keys(keys).length; var map = {}
    console.log('Generated network:')
    console.log(keys)
    if (n !== F + 1) throw new Error('not enough feeds:' + n + ', expected:' + (F + 1))

    for (var k in keys) {
      (function (key) {
        sbot.latestSequence(key, once(function (err, value) {
          if (err) {
            console.log(key, err, value)
            throw err
          }
          map[key] = isNumber(value) ? value : value.sequence
          if (--n) return
          cb(null, map)
        }))
      })(k)
    }
  }))
}

var alice = ssbKeys.generate()
var bob = ssbKeys.generate()

var animalNetwork = createSbot({
  temp: 'test-random-animals',
  port: 45451,
  host: 'localhost',
  timeout: 20001,
  replication: { hops: 3, legacy: false },
  keys: alice
})

pull(
  animalNetwork.replicate.changes(),
  pull.drain(function (prog) {
    prog.id = 'animal network'
    console.log(prog)
  })
)

tape('generate random network', function (t) {
  var start = Date.now()
  generateAnimals(animalNetwork, { add: animalNetwork.publish, id: animalNetwork.id }, F, N, function (err) {
    if (err) throw err
    console.log('replicate GRAPH')
    latest(animalNetwork, function (err, _generated) {
      if (err) throw err

      generated = _generated
      var total = 0; var feeds = 0
      for (var k in generated) {
        total += generated[k]
        feeds++
      }

      var time = (Date.now() - start) / 1000
      console.log('generated', total, 'messages in', time, 'at rate:', total / time)
      console.log('over', feeds, 'feeds')
      t.equal(total, N + 1 + F + 1)
      t.equal(feeds, F + 1)
      t.end()
    })
  })
})

tape('read all history streams', function (t) {
  var dump = createSbot({
    temp: 'test-random-animals_dump',
    //    port: 45453, host: 'localhost', timeout: 20001,
    keys: bob
  })
  var live = 0; var listeners = 0
  var h = 0

  pull(
    dump.createLogStream({ live: true, keys: false }),
    pull.drain(function (e) {
      if (!(live++ % 100)) { console.log('live', live) }
    })
  )

  var c = 0
  var start = Date.now()

  // test just dumping everything!
  // not through network connection, because createLogStream is not on public api
  pull(
    animalNetwork.createLogStream({ keys: false }),
    pull.through(function (n) {
      c++
    }),
    dump.createWriteStream(function (err, data) {
      if (err) throw err
      var time = (Date.now() - start) / 1000
      console.log('dump all messages via createLogStream')
      console.log('all histories dumped', c, 'messages in', time, 'at rate', c / time)
      console.log('read back live:', live, 'over', h, 'histories', listeners, 'listeners')
      pull(
        dump.createLogStream(),
        pull.collect(function (err, ary) {
          if (err) throw err
          console.log(c)
          t.equal(ary.length, F + N + 2)
          dump.close()
          t.end()
        })
      )
    })
  )
})

tape('replicate social network for animals', function (t) {
  // return t.end()
  var c = 0
  if (!animalNetwork.friends) { throw new Error('missing frineds plugin') }

  var start = Date.now()
  var animalFriends = createSbot({
    temp: 'test-random-animals2',
    port: 45452,
    host: 'localhost',
    timeout: 20001,
    replicate: { hops: 3, legacy: false },
    progress: true,
    seeds: [animalNetwork.getAddress()],
    keys: bob
  })

  var connections = 0

  animalFriends.on('rpc:connect', function (rpc) {
    connections++
    c++
    console.log('CONNECT', connections)
    rpc.on('closed', function () {
      console.log('DISCONNECT', --connections)
    })
  })

  require('../lib/progress')(animalFriends.progress)

  var int = setInterval(function () {
    var prog = animalFriends.progress()
    if (prog.ebt && prog.ebt.current === prog.ebt.target) {
      var target = F + N + 3
      var time = (Date.now() - start) / 1000
      console.log('replicated', target, 'messages in', time, 'at rate', target / time)
      clearInterval(int)
      t.equal(c, 1, 'everything replicated within a single connection')
      animalFriends.close(true)
      t.end()
    }
  }, 200)

  animalFriends.logging = true

  if (!animalFriends.friends) { throw new Error('missing friends plugin') }

  animalFriends.publish({
    type: 'contact',
    contact: animalNetwork.id,
    following: true
  }, function (err, msg) {
    if (err) throw err
  })
})

tape('shutdown', function (t) {
  animalNetwork.close(true)
  t.end()
})
