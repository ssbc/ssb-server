var pull      = require('pull-stream')
var paramap   = require('pull-paramap')
var ssbKeys   = require('ssb-keys')
var u         = require('./util')

var tape      = require('tape')

var cats = require('cat-names')
var dogs = require('dog-names')

//build a random network, with n members.
function bar (prog) {
  var r = prog.progress/prog.total
  var s = '\r', M = 50
  for(var i = 0; i < M; i++)
    s += i < M*r ? '*' : '.'

  return s + ' '+prog.progress+'/'+prog.total+':'+prog.feeds
}

function isNumber (n) {
  return typeof n === 'number'
}

var createSbot = require('../')
  .use(require('../plugins/friends'))
  .use(require('../plugins/replicate'))
  .use(require('../plugins/gossip'))

function generateAnimals (sbot, feed, n, cb) {
  var a = [feed]

  while(n --> 0)
    a.push(sbot.createFeed())

  console.log('generate NAMES')

  pull(
    pull.values(a),
    paramap(function (feed, cb) {
      var animal = Math.random() > 0.5 ? 'cat' : 'dog'
      var name   = animal == 'cat' ? cats.random() : dogs.allRandom()

      feed.name = name
      feed.add(u.follow(feed.id), cb)
    }, 10),
    pull.drain(null, function (err) {
      if(err) return cb(err)

      var posts = []

      pull(
        pull.count(10000),
        paramap(function (n, cb) {

          var me = a[~~(Math.random()*a.length)]
          var r = Math.random()

          //one in 20 messages is a random follow
          if(r < 0.3) {
            var f = a[~~(Math.random()*a.length)]
            me.add(u.follow(f.id), cb)
          } else if(r < 0.6) {
            me.add({
              type: 'post',
              text: me.animal === 'dog' ? 'woof' : 'meow',
            }, function (err, msg) {
              posts.push(msg.key)
              if(posts.length > 100)
                posts.shift()
              cb(null, msg)
            })
          } else {
            var post = posts[~~(Math.random()*posts.length)]
            me.add({
              type: 'post',
              repliesTo: post,
              text: me.animal === 'dog' ? 'woof woof' : 'purr',
            }, function (err, msg) {
              cb(null, msg)
            })

          }
        }, 10),
        pull.drain(null, cb)
      )

    })
  )

}

function latest (sbot, cb) {
  sbot.friends.hops({hops: 2}, function (err, keys) {
    if(err) return cb(err)
    var get = sbot.sublevel('lst').get

    var n = 0, map = {}
    for(var k in keys) (function (key) {
      n++
      get(key, function (err, value) {
        map[key] = isNumber(value) ? value : value.sequence
        if(--n) return
        cb(null, map)
      })
    })(k)
  })
}

tape('replicate social network for animals', function (t) {

  var alice = ssbKeys.generate()
  var bob   = ssbKeys.generate()

  var animalNetwork = createSbot({
    temp: 'test-random-animals',
    port: 45451, host: 'localhost', timeout: 2001,
    replication: {hops: 3}, keys: alice
  })

  if(!animalNetwork.friends)
    throw new Error('missing frineds plugin')

  generateAnimals(animalNetwork, {add: animalNetwork.publish}, 500, function (err) {
    if(err) throw err
    console.log('replicate GRAPH')
    var c = 0
    latest(animalNetwork, function (err, latest) {

      var seen = {}
      var start = Date.now()
      var animalFriends = createSbot({
        temp: 'test-random-animals2',
        port: 45452, host: 'localhost', timeout: 2001,
        replication: {hops: 3},
        progress: true,
        seeds: [animalNetwork.getAddress()],
        keys: bob
      })

      var progress = []

      pull(
        animalFriends.replicate.changes(),
        pull.drain(function (prog) {
          progress.push(prog)
          process.stdout.write(bar(prog))
        })
      )

      animalFriends.once('rpc:connect', function (rpc) {
        console.log('CONNECTION', Date.now(), c++)
      })

      if(!animalFriends.friends)
        throw new Error('missing friends plugin')

      animalFriends.publish({
        type: 'contact',
        contact: animalNetwork.id,
        following: true
      }, function (err, msg) {
        if(err) throw err
      })

      pull(
        animalFriends.createLogStream({live: true}),
        pull.drain(function (data) {
          if(data.sync) return
          seen[data.value.author] = data.value.sequence
          var total = 0, prog = 0
          for(var k in latest) {
            total += latest[k]
            prog += (seen[k] || 0)
          }

          //console.log("REPLICATED", prog, total, Math.round(100*(prog/total)))
          if(total === prog && total !== 0) {
            var seconds = (Date.now() - start)/1000
            t.equal(c, 1, 'counter is as expected')
            t.equal(prog, total)

            //WAIT FOR THE LAST PROGRESS UPDATE... (100ms)
            setTimeout(function () {

              t.ok(progress.length)
              var last = progress.pop()
              t.equal(last.total, total, 'last.total')
              t.equal(last.progress, total, 'last.total')

              console.log("DONE", seconds, c, total/seconds)
              animalFriends.close(true)
              animalNetwork.close(true)
              t.end()

            }, 200)
          }
        })
      )
    })
  })
})
