function isFunction (f) {
  return 'function' === typeof f
}

function each(obj, iter) {
  for(var k in obj)
    iter(obj[k], k, obj)
}

var ssbKeys  = require('ssb-keys')
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
        this._emit('call:'+name, args[0])
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

  api.publishBoxed = function (data, recps, cb) {
    var rpc = this
    var ts = Date.now()
    server.emit('log:info', ['publishBoxed', rpc._sessid, 'call', data])
    
    var ciphertext
    try { ciphertext = ssbKeys.box(data, recps) }
    catch (e) { return cb(e) }

    feed.add(ciphertext, function (err, msg) {
      server.emit('log:info', ['publishBoxed', rpc._sessid, 'callback' , err ? err : {key: msg.key, elapsed: Date.now() - ts}])
      cb(err, msg)
    })
  }

  api.box = function (data, recps, cb) {
    var ciphertext
    try { ciphertext = ssbKeys.box(data, recps) }
    catch (e) { return cb(e) }
    cb(null, ciphertext)
  }

  api.unbox = function (ciphertext, cb) {
    var data
    try { data = ssbKeys.unbox(ciphertext, feed.keys.private) }
    catch (e) { return cb(e) }
    cb(null, data)
  }

  api.whoami = function (_, cb) {
    if(isFunction(_)) cb = _
    cb(null, {id: feed.id, public: feed.keys.public})
  }

  return api

}

exports = module.exports = api
