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

var F           = require('ssb-friends')
var block       = require('ssb-friends/block')

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
  var index = sbot._flumeUse('friends', Reduce(2, function (_, rel) {
    G.addEdge(g, rel.from, rel.to, rel.value)
    return g
  }, function (data) {
    if(data.value.content.type === 'contact' && ref.isFeed(data.value.content.contact)) {
      var tristate = (
        data.value.content.following ? true
      : data.value.content.flagged || data.value.content.blocking ? false
      : null
      )
      return {
        from: data.value.author,
        to: data.value.content.contact,
        value: tristate
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
      var reachable
      return pull(
        index.stream(opts),
        FlatMap(function (v) {
          if(!v) return []

          //this code handles real time streaming of the hops map.
          function push (to, hops) {
            out.push(meta ? {id: to, hops: hops} : to)
          }

          var out = []

          //the edge has already been added to g
          if(!reachable) {
            reachable = F.reachable(g, start, block)
            for(var k in reachable)
              if(block.isWanted(reachable[k]))
                push(k, reachable[k][0])
          } else {
            var _reachable = F.reachable(g, start, block)
            var patch = F.diff(reachable, _reachable)
            for(var k in patch) {
              if(patch[k] == null)
                push(k, -1)
              else if(block.isWanted(patch[k]))
                push(k, patch[k][0])
            }
            reachable = _reachable
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


