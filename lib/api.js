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

    var maxAge = opts.maxAge || 30e3
    if(req.ts + maxAge < Date.now())
      return cb(new Error(
        'auth timestamp (' + req.ts + ') is older than maxAge:'+maxAge))

    if(req.public) {
      if(!server.options.verifyObj({public: req.public}, req)) {
        return cb(new Error('signature not valid'))
      }

      //if they have access to the private they,
      //this must be running from the local machine,
      //so allow everything.
      if(req.public === feed.keys.public) {
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


  api.getLocal = function (_cb, cb) {
    if(!cb) cb = _cb
    cb(null, server.localPeers || [])
  }

  return api
}

exports = module.exports = api
