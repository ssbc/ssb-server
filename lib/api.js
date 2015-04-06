var pull = require('pull-stream')

function isFunction (f) {
  return 'function' === typeof f
}

function toBuffer(v) {
  if (Buffer.isBuffer(v)) return v
  if (typeof v == 'string') return new Buffer(v, 'hex')
  return new Buffer(v)
}

function each(obj, iter) {
  for(var k in obj)
    iter(obj[k], k, obj)
}

var manifest = require('./manifest')

function api (server) {
  var ssb    = server.ssb
  var feed   = server.feed
  var config = server.config
  var opts   = server.options

  var masters = [feed.id].concat(config.master).filter(Boolean)

  if(!ssb) throw new Error('ssb is required')
  if(!feed) throw new Error('feed is required')

  var api = {}
  each(manifest, function (_, name) {
    if(ssb[name])
      api[name] = function () {
        var args = [].slice.call(arguments)
        return ssb[name].apply(ssb, args)
      }
  })

  // initialize the feed to always be with respect to
  // a given id. or would it be better to allow access to multiple feeds?

  api.publish = function (data, cb) {
    var rpc = this
    var ts = Date.now()
    server.emit('log:info', ['publish', rpc._sessid, 'call', data])
    feed.add(data, function (err, msg) {
      server.emit('log:info', ['publish', rpc._sessid, 'callback' , err ? err : {key: msg.key, elapsed: Date.now() - ts}])
      cb(err, msg)
    })
  }

  api.whoami = function (_, cb) {
    if(isFunction(_)) cb = _
    cb(null, {id: feed.id, public: feed.keys.public})
  }

  api.auth = function (req, cb) {
    var rpc = this
    var id = req.public ? opts.hash(req.public) : req.keyId
    server.emit('log:info', ['auth', rpc._sessid, 'req', id])

    console.log('AUTH DEBUG -- req:', req)

    if (!req || typeof req !== 'object' || !req.ts)
      return cb(new Error('malformed auth request'))

    var maxAge = opts.maxAge || 300e3
    if(req.ts + maxAge < Date.now())
      return cb(new Error(
        'auth timestamp (' + req.ts + ') is older than maxAge:'+maxAge))

    if(req.public) {
      if(!server.options.verifyObj({public: req.public}, req)) {
        return cb(new Error('signature not valid'))
      }

      rpc.authorized = req
      rpc.authorized.id = id

      if(~masters.indexOf(id)) {
        // authorized with one of the master keys
        // allow full access
        rpc.authorized.role = 'master'
        rpc.permissions({allow: null, deny: null})
        var res = {
          granted: true,
          type: rpc.client ? 'server' : 'client',
          role: rpc.authorized.role
        }
        rpc._emit('remote:authorized', res)
        server.emit('log:info', ['sbot', rpc._sessid, 'client-authed', id])
        return cb(null, res)
      }
      else {
        // authorized with some other master key...
        if (rpc._remoteAddress == '127.0.0.1' || rpc._remoteAddress == '::ffff:127.0.0.1' || rpc._remoteAddress == '::1') {
          // ...from the local machine, give local privileges
          rpc.authorized.role = 'local'
          rpc.permissions(server.permissions.local)          
        } else {
          // ...from a remote machine, give anonymous privileges
          rpc.authorized.role = 'anonymous'
          rpc.permissions(server.permissions.anonymous)
        }
        var res = {
          granted: true,
          type: 'peer',
          role: rpc.authorized.role
        }
        rpc._emit('remote:authorized', res)
        return cb(null, res)
      }
    }

    else if(req.hmac) {
      // authorizing with a temporary access token
      if(server.authorize(req)) {
        rpc.authorized = req

        var accessKey = server.getAccessKey(req.keyId)
        rpc.permissions(accessKey.perms)
        var res = {
          granted: true,
          type: 'client',
          role: rpc.authorized.role
        }
        rpc._emit('remote:authorized', res)
        return cb(null, res)
      }
      return cb(new Error('access denied - hmac failed'))
    }
    else
      cb(new Error('access denied - invalid request'))
  }

  return api
}

iexports = module.exports = api
