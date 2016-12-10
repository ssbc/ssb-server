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
  var g = null

  var index = sbot._flumeUse('friends', Reduce(1, function (g, rel) {
    if(!g) g = {}

    G.addEdge(g, rel.from, rel.to, rel.value)
    return g
  }, function (data) {
    if(data.value.content.type === 'contact' && ref.isFeed(data.value.content.contact))
      return {
        from: data.value.author,
        to: data.value.content.contact,
        value: data.value.content.following
      }
  }))

  return {

    get: function (opts, cb) {
      index.get(null, cb || opts)
    },

    createFriendStream: valid.source(function (opts) {
      opts = opts || {}
      var start = opts.start || sbot.id
      var reachable
      return pull(
        index.stream(opts),
        FlatMap(function (v) {
          var out = []
          if(!v) return []
          if(v.from && v.to) {
            G.addEdge(g, v.from, v.to, v.value)
            var _reachable = G.hops(g, start, 0, opts.hops || 3, reachable)
            for(var k in _reachable) {
              if(reachable[k] == null)
                out.push({id: k, hops: reachable[k] = _reachable[k]})
              else if(reachable[k] > _reachable[k])
                reachable[k] = _reachable[k]
              //else, we where already able to reach this node.
            }
          }
          else {
            g = v
            reachable = G.hops(g, start, 0, opts.hops || 3)
            for(var k in reachable)
              out.push({id: k, hops: reachable[k]})
          }
          return out
        })

      )
    }, 'createFriendStreamOpts?'),

    hops: function (opts, cb) {
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

