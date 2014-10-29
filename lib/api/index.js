var ssbapi = require('secure-scuttlebutt/api')
var Serializer = require('pull-serializer')
var JSONH = require('json-human-buffer')
var muxrpc = require('muxrpc')
var pull = require('pull-stream')

function serialize (stream) {
  return Serializer(stream, JSONH, {split: '\n\n'})
}

var manifest = exports.manifest = {
  async: [
    'whoami',
    'follow',
    'unfollow',
    'isFollowing'
  ],

  source: [
    'followedUsers'
  ]
}

exports.client = function () {
  return muxrpc(manifest, null, serialize)()
}

exports.server = function (backend) {
  var ssb  = backend.ssb
  var feed = backend.feed
  var api  = {
    whoami: function(cb) {
      cb(null, {id: feed.id, public: feed.keys.public})
    },
    follow: function(id, cb) {
      id = toBuffer(id)
      if (!id) return cb(new Error('Invalid ID'))

      // publish follows link
      feed.add({ type: 'follow', $feed: id, $rel: 'follows' }, cb)
    },
    unfollow: function(id, cb) {
      id = toBuffer(id)
      if (!id) return cb(new Error('Invalid ID'))

      api.isFollowing(id, function(err, isFollowing) {
        if (err) return cb(err)
        if (!isFollowing) return cb()

        // publish unfollows link
        feed.add({ type: 'follow', $feed: id, $rel: 'unfollows' }, cb)
      })
    },
    isFollowing: function(id, cb) {
      var id = toHexString(id)
      pull(api.followedUsers(), pull.drain(
        function(id2) {
          if (id == toHexString(id2)) {
            cb(null, true)
            return false // done processing stream
          }
        },
        function(aborted) {
          if (!aborted)
            cb(null, false)
        }
      ))
    },
    followedUsers: function() {
      return pull(
        ssb.feedsLinkedFromFeed(feed.id, 'follows'),
        pull.map(function(link) { return link.dest })
      )
    }
  }
  return muxrpc(null, manifest, serialize)(api)
}

function toBuffer(v) {
  if (Buffer.isBuffer(v)) return v
  if (typeof v == 'string') return new Buffer(v, 'hex')
  return new Buffer(v)
}

function toHexString(b) {
  if (Buffer.isBuffer(b)) return b.toString('hex')
  return b.toString()
}