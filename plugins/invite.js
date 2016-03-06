
var crypto = require('crypto')
var ssbKeys = require('ssb-keys')
var toAddress = require('../lib/util').toAddress
var cont = require('cont')
var explain = require('explain-error')
var ip = require('ip')
var mdm = require('mdmanifest')
var valid = require('../lib/validators')
var apidoc = require('../lib/apidocs').invite
var u = require('../lib/util')
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
  manifest: mdm.manifest(apidoc),
  permissions: {
    master: {allow: ['create']},
    //temp: {allow: ['use']}
  },
  init: function (server, config) {
    var codes = {}
    var codesDB = server.sublevel('codes')

    var createClient = this.createClient

    //add an auth hook.
    server.auth.hook(function (fn, args) {
      var pub = args[0], cb = args[1]
      fn(pub, function (err, auth) {
        if(err || auth) return cb(err, auth)
        codesDB.get(pub, function (_, code) {
          return cb(null, code && code.permissions)
        })
      })
    })

    var invite_plugin = {
      create: valid.async(function (n, cb) {
        var addr = server.getAddress()
        var host = u.toAddress(addr).host
        if(!config.allowPrivate && (
          ip.isPrivate(host) || 'localhost' === host)
        )
          return cb(new Error('Server has no public ip address, '
                            + 'cannot create useable invitation'))

        //this stuff is SECURITY CRITICAL
        //so it should be moved into the main app.
        //there should be something that restricts what
        //permissions the plugin can create also:
        //it should be able to diminish it's own permissions.
        var seed = crypto.randomBytes(32)
        var keyCap = ssbKeys.generate('ed25519', seed)

        var owner = server.id
        codesDB.put(keyCap.id,  {
          id: keyCap.id, total: +n, used: 0,
          permissions: {allow: ['invite.use'], deny: null}
        }, function (err) {
          if(err) cb(err)
          else cb(null, addr + '~' + seed.toString('base64'))
        })

      }, 'number'),
      use: valid.async(function (req, cb) {
        var rpc = this

        codesDB.get(rpc.id, function(err, invite) {
          if(err) return cb(err)

          server.friends.all('follow', function(err, follows) {
            if (follows && follows[server.id] && follows[server.id][req.feed])
              return cb(new Error('already following'))

            // although we already know the current feed
            // it's included so that request cannot be replayed.
            if(!req.feed)
              return cb(new Error('feed to follow is missing'))

            if(invite.used >= invite.total)
              return cb(new Error('invite has expired'))

            invite.used ++

            //never allow this to be used again
            if(invite.used >= invite.total)
              invite.permissions = {allow: [], deny: true}

            //okay so there is a small race condition here
            //if people use a code massively in parallel
            //then it may not be counted correctly...
            //this is not a big enough deal to fix though.

            codesDB.put(rpc.id, invite, function (err) {
              server.emit('log:info', ['invite', rpc.id, 'use', req])

              server.publish({
                type: 'contact',
                contact: req.feed,
                following: true,
                autofollow: true
              }, cb)
            })
          })
        })
      }, 'object'),
      addMe: valid.async(function (invite, cb) {
        return invite_plugin.accept(invite, cb)
      }, 'string'),
      accept: valid.async(function (invite, cb) {
        var parts = invite.split('~')
        var addr = toAddress(parts[0])

        createClient({seed: parts[1]})
        (addr, function (err, rpc) {
          if(err) return cb(explain(err, 'could not connect to server'))
          rpc.invite.use({feed: server.id}, function (err, msg) {
            if(err) return cb(explain(err, 'invite not accepted'))
            
            cont.para([
              server.publish({
                type: 'contact',
                following: true,
                autofollow: true,
                contact: addr.link || addr.key
              }),
              server.publish({
                type: 'pub',
                address: addr,
              })
            ])(function (err, results) {
              rpc.close()
              cb(err, results)
            })
          })
        })
      }, 'string')
    }
    return invite_plugin
  }
}

