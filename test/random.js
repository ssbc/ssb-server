var pull      = require('pull-stream')

var paramap   = require('pull-paramap')

var tape      = require('tape')

var u    = require('./util')
var cats = require('cat-names')
var dogs = require('dog-names')

//build a random network, with n members.

function generateAnimals (sbot, n, cb) {
  var ssb = sbot.ssb
  var a = [sbot.feed]
  while(n --> 0) {
    a.push(ssb.createFeed())
  }

  console.log('generate NAMES')

  pull(
    pull.values(a),
    paramap(function (feed, cb) {
      var animal = Math.random() > 0.5 ? 'cat' : 'dog'
      var name   = animal == 'cat' ? cats.random() : dogs.allRandom()

      feed.name = name
      feed.add({
        type: 'contact',
        contact: {feed: feed.id},
        name: name, animal: animal
      }, cb)
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
            me.add({
              type: 'contact',
              contact: { feed: f.id },
              following: true,
              name: f.name
            }, cb)
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
              repliesTo: {msg: post},
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

var friends = require('../plugins/friends')
var gossip = require('../plugins/gossip')
var replicate = require('../plugins/replicate')


function latest (sbot, cb) {

  sbot.friends.hops({hops: 2}, function (err, keys) {
    if(err) return cb(err)

    var get = 
        sbot.ssb.sublevel('lst').get
    var n = 0, map = {}
    for(var k in keys) (function (key) {
      n++
      get(key, function (err, value) {
        map[key] = value
        if(--n) return
        cb(null, map)
      })
    })(k)

  })

}

tape('replicate social network for animals', function (t) {

  var animalNetwork = u.createDB('test-random-animals', {
    port: 45451, host: 'localhost', timeout: 2001
  }).use(friends).use(replicate)

    if(!animalNetwork.friends)
      throw new Error('missing frineds plugin')

  generateAnimals(animalNetwork, 500, function (err) {
    if(err) throw err
    console.log('replicate GRAPH')
    var c = 0
    latest(animalNetwork, function (err, latest) {

      var seen = {}
      var start = Date.now()
      var animalFriends = u.createDB('test-random-animals2', {
        port: 45452, host: 'localhost', timeout: 2001,
        seeds: [{port: 45451, host: 'localhost', key: animalNetwork.feed.keys.public}]
      }).use(friends).use(replicate).use(gossip)

      animalFriends.on('rpc:connect', function () {
        console.log('CONNECTION', Date.now(), c++)
      })

      if(!animalFriends.friends)
        throw new Error('missing friends plugin')

      animalFriends.feed.add({
        type: 'contact',
        contact: {feed: animalNetwork.feed.id},
        following: true
      }, function (err) {
        if(err) throw err
        console.log("friended")
      })

      pull(
        animalFriends.ssb.createLogStream({live: true}),
        pull.drain(function (data) {
          if(data.sync) return
          seen[data.value.author] = data.value.sequence
          var total = 0, prog = 0
          for(var k in latest) {
            total += latest[k]
            prog += (seen[k] || 0)
          }
          console.log("REPLICATED", prog, total, Math.round(100*(prog/total)))
          if(total === prog) {
            var seconds = (Date.now() - start)/1000
            t.equal(c, 1)
            t.equal(prog, total)

            console.log("DONE", seconds, c, total/seconds)
            animalFriends.close()
            animalNetwork.close()
            t.end()

          }

        })
      )
    })
  })
})
