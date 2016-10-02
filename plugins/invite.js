var crypto = require('crypto')
var ssbKeys = require('ssb-keys')
var toAddress = require('../lib/util').toAddress
var cont = require('cont')
var explain = require('explain-error')
var ip = require('ip')
var mdm = require('mdmanifest')
var valid = require('../lib/validators')
var apidoc = require('../lib/apidocs').invite
var ref = require('ssb-ref')

var ssbClient = require('ssb-client')

// invite plugin
// adds methods for producing invite-codes,
// which peers can use to command your server to follow them.

function isFunction (f) {
  return 'function' === typeof f
}

function isString (s) {
  return 'string' === typeof s
}

function isObject(o) {
  return o && 'object' === typeof o
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
      var pubkey = args[0], cb = args[1]

      // run normal authentication
      fn(pubkey, function (err, auth) {
        if(err || auth) return cb(err, auth)

        // if no rights were already defined for this pubkey
        // check if the pubkey is one of our invite codes
        codesDB.get(pubkey, function (_, code) {
          //disallow if this invite has already been used.
          if(code && (code.used >= code.total)) cb()
          else cb(null, code && code.permissions)
        })
      })
    })

    return {
      create: valid.async(function (n, cb) {
        var modern = false
        if(isObject(n) && n.modern) {
          n = 1
          modern = true
        }
        var addr = server.getAddress()
        var host = ref.parseAddress(addr).host
        if(!config.allowPrivate && (ip.isPrivate(host) || 'localhost' === host))
          return cb(new Error('Server has no public ip address, '
                            + 'cannot create useable invitation'))

        //this stuff is SECURITY CRITICAL
        //so it should be moved into the main app.
        //there should be something that restricts what
        //permissions the plugin can create also:
        //it should be able to diminish it's own permissions.

        // generate a key-seed and its key
        var seed = crypto.randomBytes(32)
        var keyCap = ssbKeys.generate('ed25519', seed)

        // store metadata under the generated pubkey
        var owner = server.id
        codesDB.put(keyCap.id,  {
          id: keyCap.id,
          total: +n,
          used: 0,
          permissions: {allow: ['invite.use', 'getAddress'], deny: null}
        }, function (err) {
          // emit the invite code: our server address, plus the key-seed
          if(err) cb(err)
          else if(modern && server.ws && server.ws.getAddress) {
            cb(null, server.ws.getAddress()+':'+seed.toString('base64'))
          }
          else {
            addr = ref.parseAddress(addr)
            cb(null, [addr.host, addr.port, addr.key].join(':') + '~' + seed.toString('base64'))
          }
        })
      }, 'number|object'),
      use: valid.async(function (req, cb) {
        var rpc = this

        // fetch the code
        codesDB.get(rpc.id, function(err, invite) {
          if(err) return cb(err)

          // check if we're already following them
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
            if(invite.used >= invite.total) {
              invite.permissions = {allow: [], deny: null}
            }
            //TODO
            //okay so there is a small race condition here
            //if people use a code massively in parallel
            //then it may not be counted correctly...
            //this is not a big enough deal to fix though.
            //-dominic

            // update code metadata
            codesDB.put(rpc.id, invite, function (err) {
              server.emit('log:info', ['invite', rpc.id, 'use', req])

              // follow the user
              server.publish({
                type: 'contact',
                contact: req.feed,
                following: true,
                pub: true
              }, cb)
            })
          })
        })
      }, 'object'),
      accept: valid.async(function (invite, cb) {
        // remove surrounding quotes, if found
        if (invite.charAt(0) === '"' && invite.charAt(invite.length - 1) === '"')
          invite = invite.slice(1, -1)
        var opts
        // connect to the address in the invite code
        // using a keypair generated from the key-seed in the invite code
        var modern = false
        if(ref.isInvite(invite)) { //legacy ivite
          if(ref.isLegacyInvite(invite)) {
            var parts = invite.split('~')
            opts = ref.parseAddress(parts[0])//.split(':')
            //convert legacy code to multiserver invite code.
            invite = 'net:'+opts.host+':'+opts.port+'~shs:'+opts.key.slice(1, -8)+':'+parts[1]
          }
          else
            modern = true
        }

        opts = ref.parseAddress(ref.parseInvite(invite).remote)

        ssbClient(null, {
          remote: invite,
          manifest: {invite: {use: 'async'}, getAddress: 'async'}
        }, function (err, rpc) {
          if(err) return cb(explain(err, 'could not connect to server'))

          // command the peer to follow me
          rpc.invite.use({ feed: server.id }, function (err, msg) {
            if(err) return cb(explain(err, 'invite not accepted'))
            
            // follow and announce the pub
            cont.para([
              server.publish({
                type: 'contact',
                following: true,
                autofollow: true,
                contact: opts.key
              }),
              (
                opts.host
                ? server.publish({
                    type: 'pub',
                    address: opts
                  })
                : function (cb) { cb() }
              )
            ])
            (function (err, results) {
              if(err) return cb(err)
              rpc.getAddress(function (err, addr) {
                rpc.close()
                //ignore err if this is new style invite
                if(modern && err) return cb(err, addr)
                if(server.gossip) server.gossip.add(addr, 'seed')
                cb(null, results)
              })
            })
          })
        })
      }, 'string')
    }
  }
}


