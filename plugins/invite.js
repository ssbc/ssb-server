
var crypto = require('crypto')
var ssbKeys = require('ssb-keys')
var toAddress = require('../lib/util').toAddress
var cont = require('cont')
var explain = require('explain-error')
var ip = require('ip')
//okay this plugin adds a method
//invite(seal({code, public})


function isFunction (f) {
  return 'function' === typeof f
}

function isString (s) {
  return 'string' === typeof s
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
    var codesDB = server.ssb.sublevel('codes')
    return {
      create: function (n, cb) {
        if(isFunction(n) || n == null || isNaN(n))
          return cb(new Error('invite.create must get number of uses.'))

        var addr = server.getAddress()
        var host = addr.split(':')[0]
        if(!server.config.allowPrivate && (
          ip.isPrivate(host) || 'localhost' === host)
        )
          return cb(new Error('Server has no public ip address,'
                            + 'cannot create useable invitation'))

        var secret = crypto.randomBytes(32).toString('base64')
        var keyId = ssbKeys.hash(secret, 'base64')

//        codes[keyId] = {
//          secret: secret, total: n, used: 0
//        }

        var owner = server.feed
        codesDB.put(keyId,  {
          secret: secret, total: n, used: 0
        }, function (err) {
          if(err) cb(err)
          else cb(null, [addr, owner.id, secret].join(','))
        })

      },
      use: function (req, cb) {
        var rpc = this
        if(rpc.authorized.hmac)
          return cb(new Error('cannot use invite code when authorized with hmac'))

        var id = rpc.authorized.id
        codesDB.get(req.keyId, function(err, invite) {

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

          //okay so there is a small race condition here
          //if people use a code massively in parallel
          //then it may not be counted correctly...
          //this is not a big enough deal to fix though.

          codesDB.put(req.keyId, invite, function (err) {
            server.emit('log:info', ['invite', rpc._sessid, 'use', req])

            server.feed.add({
              type: 'follow',
              feed: id, rel: 'follows',
              auto: true
            }, cb)
          })
        })
      },
      addMe: function (req, cb) {
        if(isString(req)) {
          req = req.split(',')
          req = {
            address: req[0],
            id: req[1],
            invite: req[2]
          }
        }
        var rpc = server.connect(toAddress(req.address))

        rpc.once('rpc:unauthorized', function (err) {
          rpc.close(); cb(err)
        })

        var remote, auth, done

        rpc.once('remote:authorized', function (res) {
          remote = true
          if(remote && done) next()
        })

        rpc.once('rpc:authorized', function (res) {
          auth = true; done = rpc.task()
          if(remote && done) next()
        })

        function next () {
          if(rpc.authorized.id !== req.id) {
            rpc.close()
            return cb(new Error('pub server did not have correct public key'))
          }
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
        }
      }
    }
  }
}

