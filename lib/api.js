var Serializer = require('pull-serializer')
var JSONH = require('json-human-buffer')
var muxrpc = require('muxrpc')
var toPull = require('stream-to-pull-stream')
var pull = require('pull-stream')

function serialize (stream) {
  return Serializer(stream, JSONH, {split: '\n\n'})
}

function isFunction (f) {
  return 'function' === typeof f
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

var manifest = {
  async: [
    'add',
    'get',
    'getPublicKey',
    'getLatest',
    'whoami',
    'auth',

    // admin api
    'follow',
    'unfollow',
    'isFollowing',
    'setProfile'
  ],

  source: [
    'createFeedStream',
    'createHistoryStream',
    'createLogStream',
    'messagesByType',
    'messagesLinkedToMessage',
    'messagesLinkedToFeed',
    'messagesLinkedFromFeed',
    'feedsLinkedToFeed',
    'feedsLinkedFromFeed',

    // admin api
    'followedUsers'
  ]
}

function api (ssb, feed, config) {
  if(!ssb) throw new Error('ssb is required')
  if(!feed) throw new Error('feed is required')

  var api = {}
  for(var key in manifest) {
    manifest[key].forEach(function (name) {
      api[name] = function () {
        var args = [].slice.call(arguments)
        var f = ssb[name].apply(ssb, args)
        if(f)
          return pull(f, function (read) {
            return function (abort, cb) {
              read(abort, function (err, data) {
                cb(err, data)
              })
            }
          })
      }
    })
  }

  // initialize the feed to always be with respect to
  // a given id. or would it be better to allow access to multiple feeds?

  api.add = function (data, cb) {
    feed.add(data, cb)
  }

  api.whoami = function (_, cb) {
    if(isFunction(_)) cb = _
    cb(null, {id: feed.id, public: feed.keys.public})
  }

  api.auth = function (pass, cb) {
    if(pass === config.pass) {
      console.log(this)
      this.permissions({allow: null})
      return cb()
    }
    cb(new Error('access denied'))
  }

  api.setProfile = function(prof, cb) {
    if (!prof || typeof prof != 'object' || !prof.nickname || typeof prof.nickname != 'string')
      return cb(new Error('Must pass an object with {nickname: String}'))
    feed.add({ type: 'profile', nickname: prof.nickname }, cb)
  }

  api.follow = function(id, cb) {
    id = toBuffer(id)
    if (!id) return cb(new Error('Invalid ID'))

    // publish follows link
    feed.add({ type: 'follow', $feed: id, $rel: 'follows' }, cb)
  }

  api.unfollow = function(id, cb) {
    id = toBuffer(id)
    if (!id) return cb(new Error('Invalid ID'))

    api.isFollowing(id, function(err, isFollowing) {
      if (err) return cb(err)
      if (!isFollowing) return cb()

      // publish unfollows link
      feed.add({ type: 'follow', $feed: id, $rel: 'unfollows' }, cb)
    })
  }

  api.isFollowing = function(id, cb) {
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
  }

  api.followedUsers = function() {
    return pull(
      ssb.feedsLinkedFromFeed(feed.id, 'follows'),
      pull.map(function(link) { return link.dest })
    )
  }

  return api
}

exports = module.exports = api
exports.manifest = manifest

exports.client = function () {
  return muxrpc(manifest, null, serialize) ({})
}

exports.peer = function (ssb, feed, config, _serialize) {
  //this is terribly dangerous until we have authorization on the rpc stream
  return muxrpc(manifest, manifest, _serialize || serialize) (exports(ssb, feed, config))
      .permissions({allow: ['auth', 'createHistoryStream']})
}

