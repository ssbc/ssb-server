var pull = require('pull-stream')

function isFunction (f) {
  return 'function' === typeof f
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
    if(name === 'createHistoryStream') {
      //THIS UGLY HACK IS JUST IN DEV
      //DO NOT MERGE PR WITH THIS CODE IN IT!!!
      api.createHistoryStream = function (opts) {
        var id = this.id
        this._emit('call:'+name, opts)
        if(!server.block) return ssb.createHistoryStream(opts)

        if(
          opts.id !== id &&
          server.block.isBlocked({source: opts.id, dest: id})
        )
          return ssb.createHistoryStream({id: null, seq: 0})
        else
          return pull(
            ssb.createHistoryStream(opts),
            //break off this feed if they suddenly block
            //the recipient.
            pull.take(function (msg) {
              if(msg.content.type !== 'contact') return true
              return !(
                msg.content.flagged &&
                msg.content.contact.feed === id
              )
            })
          )
     }
    }
    else
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

  api.whoami = function (_, cb) {
    if(isFunction(_)) cb = _
    cb(null, {id: feed.id, public: feed.keys.public})
  }

  return api

}

exports = module.exports = api
