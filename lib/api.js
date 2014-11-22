var Serializer = require('pull-serializer')
var muxrpc = require('muxrpc')
var toPull = require('stream-to-pull-stream')
var pull = require('pull-stream')
var Seal = require('./seal')
var deepEqual = require('deep-equal')

function serialize (stream) {
  return Serializer(stream, JSON, {split: '\n\n'})
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

function api (server, config) {
  var ssb = server.ssb
  var feed = server.feed
  var opts = server.options
  var seal = Seal(server.options)
  if(!ssb) throw new Error('ssb is required')
  if(!feed) throw new Error('feed is required')

  var api = {}
  for(var key in manifest) {
    manifest[key].forEach(function (name) {
      api[name] = function () {
        var args = [].slice.call(arguments)
        return ssb[name].apply(ssb, args)
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

  api.auth = function (req, cb) {
    var rpc = this
    // hmm, actually this has the problem that
    // the connection must be signed...
    // and this implies we would have to copy the private key to the
    // client...

    // we don't really want to do that. because it makes difficult
    // to reason about security holes... But we could have a local
    // secret, that is hmacs and it's only returned to localhost.
    // but, we could also generate longer term secrets,
    // that where attached to various perms, for remote controllers...

    var maxAge = config.magAge || 30e3
    if(req.ts + maxAge < Date.now())
      return cb(new Error(
        'auth timestamp (' + req.ts + ') is older than maxAge:'+maxAge))

    if(req.public) {
      if(!seal.verify({public: req.public}, req)) {
        return cb(new Error('signature not valid'))
      }

      //if they have access to the private they,
      //this must be running from the local machine,
      //so allow everything.
      if(deepEqual(req.public, feed.keys.public)) {
        rpc.permissions({allow: null, deny: null})
        return cb(null, {granted: true, type: 'client'})
      }

      //else, if it's an anonymous peer, allow createHistoryStream
      else {
        rpc.permissions({allow: ['createHistoryStream']})
        return cb(null, {granted: true, type: 'peer'})
      }
    }

    if(req.hmac) {
      if(server.authorize(req)) {
        rpc.permissions({allow: null, deny: null})
        return cb(null, {granted: true, type: 'client'})
      }
      return cb(new Error('access denied - hmac failed'))
    }
    else
      cb(new Error('access denied - invalid request'))
  }

  api.setProfile = function(prof, cb) {
    if (!prof || typeof prof != 'object' || !prof.nickname || typeof prof.nickname != 'string')
      return cb(new Error('Must pass an object with {nickname: String}'))
    feed.add({ type: 'profile', nickname: prof.nickname }, cb)
  }

  api.follow = function(id, cb) {
    // id = toBuffer(id)
    if (!id) return cb(new Error('Invalid ID'))

    // publish follows link
    feed.add({ type: 'follow', $feed: id, $rel: 'follows' }, cb)
  }

  api.unfollow = function(id, cb) {
    // id = toBuffer(id)
    if (!id) return cb(new Error('Invalid ID'))

    api.isFollowing(id, function(err, isFollowing) {
      if (err) return cb(err)
      if (!isFollowing) return cb()

      // publish unfollows link
      feed.add({ type: 'follow', $feed: id, $rel: 'unfollows' }, cb)
    })
  }

  api.isFollowing = function(id, cb) {
    // var id = toHexString(id)
    pull(api.followedUsers(), pull.drain(
      function(id2) {
        if (id == id2) { //toHexString(id2)) {
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

exports.peer = function (server, config, _serialize) {
  //this is terribly dangerous until we have authorization on the rpc stream
  return muxrpc(manifest, manifest, _serialize || serialize) (exports(server, config))
      .permissions({allow: ['auth']})
}

