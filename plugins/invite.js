
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
    master: {allow: ['create']},
    //temp: {allow: ['use']}
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

        //this stuff is SECURITY CRITICAL
        //so it should be moved into the main app.
        //there should be something that restricts what
        //permissions the plugin can create also:
        //it should be able to diminish it's own permissions.
        var seed = crypto.randomBytes(32)
        var keyCap = ssbKeys.generate('ed25519', seed)

        var owner = server.feed.keys.public
        codesDB.put(keyCap.id,  {
          public: keyCap.public, total: +n, used: 0,
                              //TODO: kill "emit"
                              //(need to figure out what its used for)
          permissions: {allow: ['emit', 'invite.use'], deny: null}
        }, function (err) {
          if(err) cb(err)
          else cb(null, [addr, owner, seed.toString('base64')].join(','))
        })

      },
      use: function (req, cb) {
        var rpc = this

        server.friends.all('follow', function(err, follows) {
          if (follows && follows[server.feed.id] && follows[server.feed.id][id])
            return cb(new Error('already following'))

          codesDB.get(rpc.id, function(err, invite) {
            if(err) return cb(err)
            // although we already know the current feed
            // it's included so that request cannot be replayed.
            if(!req.feed)
              return cb(new Error('feed to follow is missing'))

            if(invite.used >= invite.total)
              return cb(new Error('invite code:'+id+' has expired'))

            invite.used ++

            //never allow this to be used again
            if(invite.used >= invite.total)
              invite.permissions = {allow: [], deny: true}

            //okay so there is a small race condition here
            //if people use a code massively in parallel
            //then it may not be counted correctly...
            //this is not a big enough deal to fix though.

            codesDB.put(req.keyId, invite, function (err) {
              server.emit('log:info', ['invite', rpc._sessid, 'use', req])

              server.feed.add({
                type: 'contact',
                contact: { feed: req.feed },
                following: true,
                autofollow: true
              }, cb)
            })
          })
        })
      },
      addMe: function (req, cb) {
//        if(isString(req)) {
//          req = req.split(',')
//          req = {
//            address: req[0],
//            id: req[1],
//            invite: req[2]
//          }
//        }
//        var rpc = server.connect(toAddress(req.address))
//
//        rpc.once('rpc:unauthorized', function (err) {
//          rpc.close(); cb(err)
//        })
//
//        var remote, auth, done
//
//        rpc.once('remote:authorized', function (res) {
//          remote = true
//          if(remote && done) next()
//        })
//
//        rpc.once('rpc:authorized', function (res) {
//          auth = true; done = rpc.task()
//          if(remote && done) next()
//        })
//
//        function next () {
//          if(rpc.authorized.id !== req.id) {
//            rpc.close()
//            return cb(new Error('pub server did not have correct public key'))
//          }
//          var secret = req.secret || req.invite
//          delete req.invite
//          delete req.secret
//          req.feed = req.feed || server.feed.id
//
//          var invite = ssbKeys.signObjHmac(secret, {
//            keyId: ssbKeys.hash(secret, 'base64'),
//            feed: server.feed.id,
//            ts: Date.now()
//          })
//
//          rpc.invite.use(invite, function (err, res) {
//            if(err) {
//              done(); cb(explain(err, 'invite not accepted'))
//              return
//            }
//            cont.para([
//              server.feed.add({
//                type: 'contact',
//                following: true,
//                contact: { feed: rpc.authorized.id }
//              }),
//              server.feed.add({
//                type: 'pub',
//                address: req.address
//              })
//            ])(function (err, results) {
//              done()
//              cb(err, results)
//            })
//          })
//        }
      }
    }
  }
}

