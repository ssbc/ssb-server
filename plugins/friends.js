var G           = require('graphreduce')
var Reduce      = require('flumeview-reduce')
var pull        = require('pull-stream')
var FlatMap     = require('pull-flatmap')
//var mlib        = require('ssb-msgs')
//var pushable    = require('pull-pushable')
var mdm         = require('mdmanifest')
var valid       = require('../lib/validators')
var apidoc      = require('../lib/apidocs').friends
var ref         = require('ssb-ref')

// friends plugin
// methods to analyze the social graph
// maintains a 'follow' and 'flag' graph

function isFunction (f) {
  return 'function' === typeof f
}

function isString (s) {
  return 'string' === typeof s
}

function isFriend (friends, a, b) {
  return friends[a] && friends[b] && friends[a][b] && friends[b][a]
}

exports.name = 'friends'
exports.version = '1.0.0'
exports.manifest = mdm.manifest(apidoc)

exports.init = function (sbot, config) {
  var g = {}
  var index = sbot._flumeUse('friends', Reduce(1, function (_, rel) {
    //if(!g) g = {}
    if(!ref.isFeed(rel.from)) throw new Error('FROM is not id')
    G.addEdge(g, rel.from, rel.to, rel.value)
    return g
  }, function (data) {
    if(data.value.content.type === 'contact' && ref.isFeed(data.value.content.contact)) {
      return {
        from: data.value.author,
        to: data.value.content.contact,
        value: data.value.content.following
      }
    }
  }))

  return {

    get: function (opts, cb) {
      index.get(opts, cb)
    },

    createFriendStream: valid.source(function (opts) {
      opts = opts || {}
      var live = opts.live === true
      var meta = opts.meta === true
      var start = opts.start || sbot.id
      var first = true
      var reachable
      if(!g) throw new Error('not initialized')
      //g = g || {}
      return pull(
        index.stream(opts),
        FlatMap(function (v) {
          if(!v) return []

          //this code handles real time streaming of the hops map.
          function push (to, hops) {
            out.push(meta ? {id: to, hops: hops} : to)
          }
          var out = []
          if(v.from && v.to) {
            if(!reachable) {
              //this is is hack...
              reachable = {}
              reachable[sbot.id] = 0
              push(sbot.id, 0)
            }
            //recalculate the portion of the graph, reachable in opts.hops
            //(but only the portion not already reachable)
            var _reachable = G.hops(g, v.from, reachable[v.from], opts.hops || 3, reachable)

            for(var k in _reachable) {
              //check if it has _become_ reachable just now.
              //if so add to the set
              if(reachable[k] == null)
                push(k, reachable[k] = _reachable[k])
              //if this has shortened the path, then update.
              else if(reachable[k] > _reachable[k])
                reachable[k] = _reachable[k]
              //else, we where already able to reach this node.
            }
          }
          else {
            var _g = v
            reachable = G.hops(_g, start, 0, opts.hops || 3)
            for(var k in reachable)
              push(k, reachable[k])
          }
          if(first) {
            first = false
            if(live) {
              out.push({sync: true})
            }
          }

          return out
        })

      )
    }, 'createFriendStreamOpts?'),

    hops: function (opts, cb) {
      if(isFunction(opts))
        cb = opts, opts = {}
      opts = opts || {}
      if(isString(opts))
        opts = {start: opts}
      index.get(null, function (err, g) {
        if(err) cb(err)
        else cb(null, G.hops(g, opts.start || sbot.id, 0, opts.hops || 3))
      })
    }
  }
}


