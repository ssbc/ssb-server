
var crypto = require('crypto')
var ssbKeys = require('ssb-keys')
var toAddress = require('../lib/util').toAddress
var cont = require('cont')
var explain = require('explain-error')
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
    use: 'async',
    addMe: 'async'
  },
  permissions: {
    anonymous: {allow: ['use']}
  },
  init: function (server) {
    var codes = {}
    return {
      create: function (n, cb) {
        console.log(n)
        if(isFunction(n) || n == null || isNaN(n))
          return cb(new Error('invite.create must get number of uses.'))

        var secret = crypto.randomBytes(32).toString('base64')
        var keyId = ssbKeys.hash(secret, 'base64')
        codes[keyId] = {
          secret: secret, total: n, used: 0
        }

        var addr = server.getAddress()
        if (addr.indexOf('localhost') !== -1)
          return cb(new Error('Server has no `hostname` configured, unable to create an invite token'))

        var owner = this.authorized || server.feed

        cb(null, {
          address: addr,
          id: owner.id,
          secret: secret
        })
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
          return cb(new Error('invite code is incorrect or expired'))

        if(invite.used >= invite.count)
          return cb(new Error('invite code:'+id+' has expired'))

        if(!ssbKeys.verifyObjHmac(invite.secret, req))
          return cb(new Error('invalid invite request'))

        invite.used ++
//        server.emit('log:info', '[INVI] Use() called by', id, ' (RPC#'+rpc._sessid+')')

        server.feed.add({
          type: 'follow',
          feed: id, rel: 'follows',
          auto: true
        }, cb)
      },
      addMe: function (req, cb) {
        var rpc = server.connect(toAddress(req.address))
        rpc.once('rpc:unauthorized', function (err) {
          rpc.close(); cb(err)
        }),
        rpc.once('rpc:authorized', function (res) {
          var done = rpc.task()
          var secret = req.secret || req.invite
          delete req.invite
          delete req.secret
          req.feed = req.feed || server.feed.id

          var invite = ssbKeys.signObjHmac(secret, {
            keyId: ssbKeys.hash(secret, 'base64'),
            feed: server.feed.id,
            ts: Date.now()
          })

          rpc.invite.use(invite, function (err, res) {
            if(err) {
              done(); cb(explain(err, 'invite not accepted'))
              return
            }
            cont.para([
              server.feed.add({
                type: 'follow',
                feed: rpc.authorized.id, rel: 'follows',
              }),
              server.feed.add({
                type: 'pub',
                address: req.address
              })
            ])(function (err, results) {
              done()
              cb(err, results)
            })
          })
        })
      }
    }
  }
}

