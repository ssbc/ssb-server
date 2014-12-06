var pull = require('pull-stream')

function toHexString(b) {
  if (Buffer.isBuffer(b)) return b.toString('hex')
  return b.toString()
}

exports.name = 'easy'
exports.version = '1.0.0'

exports.manifest = {
  // admin api
  'follow'        : 'async',
  'unfollow'      : 'async',
  'isFollowing'   : 'async',
  'setProfile'    : 'async',
  'followedUsers' : 'source'
}

exports.init = function (server) {

  var ssb = server.ssb
  var feed = server.feed

  var api = {}

  api.setProfile = function(prof, cb) {
    if (!prof || typeof prof != 'object' || !prof.nickname || typeof prof.nickname != 'string')
      return cb(new Error('Must pass an object with {nickname: String}'))
    feed.add({ type: 'profile', nickname: prof.nickname }, cb)
  }

  api.follow = function(id, cb) {
    // id = toBuffer(id)
    if (!id) return cb(new Error('Invalid ID'))

    // publish follows link
    feed.add({ type: 'follow', feed: id, rel: 'follows' }, cb)
  }

  api.unfollow = function(id, cb) {
    // id = toBuffer(id)
    if (!id) return cb(new Error('Invalid ID'))

    api.isFollowing(id, function(err, isFollowing) {
      if (err) return cb(err)
      if (!isFollowing) return cb()

      // publish unfollows link
      feed.add({ type: 'follow', feed: id, rel: 'unfollows' }, cb)
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
