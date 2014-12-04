
var crypto = require('crypto')
var ssbKeys = require('ssb-keys')
//okay this plugin adds a method
//invite(seal({code, public})


function isFunction (f) {
  return 'function' === typeof f
}

module.exports = {
  name: 'invite',
  version: '1.0.0',
  manifest: {
    create: 'async',
    use: 'async'
  },
  permissions: {
    anonymous: {allow: ['use']}
  },
  init: function (server) {
    var codes = {}
    return {
      create: function (n, cb) {
        if(isFunction(n))
          return cb(new Error('must pass a number to createInvite'))

        var secret = crypto.randomBytes(32).toString('base64')
        codes[ssbKeys.hash(secret, 'base64')] = {
          secret: secret, total: n, used: 0
        }

        var token = {
          addr: server.getAddress(),
          id: server.getId(),
          sec: secret
        }
        if (token.addr.indexOf('localhost') !== -1)
          delete token.addr
        cb(null, token)
      },
      use: function (req, cb) {
        var rpc = this
        if(rpc.authorized.hmac)
          return cb(new Error('cannot use invite code when authorized with hmac'))

        var id = rpc.authorized.id
        var invite = codes[req.keyId]

        // although we already know the current feed
        // it's included so that request cannot be replayed.
        if(!req.feed)
          return cb(new Error('feed to follow is missing'))

        if(req.feed !== id)
          return cb(new Error('invite code may not be used to follow another key'))

        if(!invite)
          return cb(new Error('unknown id:'+req.id))

        if(invite.used >= invite.count)
          return cb(new Error('invite code:'+id+' has expired'))

        if(!ssbKeys.verifyObjHmac(invite.secret, req))
          return cb(new Error('invalid invite request'))

        invite.used ++

        server.feed.add({
          type: 'auto-follow',
          $feed: id, $rel: 'follows'
        }, cb)
      }
    }
  }
}

