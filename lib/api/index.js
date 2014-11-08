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
    'auth',
    'whoami',
    'follow',
    'unfollow',
    'isFollowing',
    'setProfile'
  ],
  source: [
    'followedUsers'
  ],
  duplex: [
    'createReplicationStream'
  ]
}

exports.client = function () {
  return muxrpc(manifest, null, serialize)()
}

exports.server = function (backend) {
  var ssb  = backend.ssb
  var feed = backend.feed
  var api  = {
    auth: function(opts, cb) {
      if (!opts || typeof opts != 'object')
        return cb(new Error('Requires username and password'))

      // run backend's auth function
      var perms = backend.auth(opts)
      if (perms instanceof Error)
        return cb(perms)

      // update perms
      rpc.permissions(perms)
      cb(null, {allow: perms.allow, dney: perms.deny})
    },
    whoami: function(cb) {
      cb(null, {id: feed.id, public: feed.keys.public})
    },
    setProfile: function(prof, cb) {
      if (!prof || typeof prof != 'object' || !prof.nickname || typeof prof.nickname != 'string')
        return cb(new Error('Must pass an object with {nickname: String}'))
      feed.add({ type: 'profile', nickname: prof.nickname }, cb)
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
    },
    createReplicationStream: function() {
      return feed.createReplicationStream({ rel: 'follows' }, function(){})
    }
  }
  var rpc = muxrpc(null, manifest, serialize)(api)
  rpc.permissions(backend.auth({ user: 'anon', pass: '' })) // login to default user
  return rpc
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