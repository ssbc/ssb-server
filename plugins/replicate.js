var pull = require('pull-stream')
var Notify = require('pull-notify')
var pushable = require('pull-pushable')
var many = require('pull-many')
var cat = require('pull-cat')
var Abort = require('pull-abortable')
var Debounce = require('observ-debounce')
var Observ = require('observ')

var notify = Notify()

function replicate(sbot, config, rpc, cb) {
    var aborter = Abort()
    var sources = many()
    var sent = 0

    var to_send = {}, to_recv = {}

    rpc.on('call:createHistoryStream', function (opts) {
      to_send[opts.id] = (opts.sequence || opts.seq) - 1
    })

    rpc.progress = Observ()

    //var set_progress = rpc.progress.set
    //delete rpc.progress.set
    //rpc._emit('replicate:progress', rpc.progress)

    //these defaults are for replication
    //so they belong in the replication config
    var opts = config.replication || {}
    opts.hops = opts.hops || 3
    opts.dunbar = opts.dunbar || 150

    pull(
      sbot.friends.createFriendStream(opts),
      aborter,
      pull.through(function (s) {
        to_recv[s] = 0
      }),
      sbot.createLatestLookupStream(),
      pull.drain(function (upto) {
        to_recv[upto.id] = upto.sequence
        replicated[upto.id] = upto.sequence
        sources.add(rpc.createHistoryStream({
          id: upto.id, seq: upto.sequence + 1,
          live: true, keys: false
        }))
      }, function (err) {
        if(err)
          sbot.emit('log:error', ['replication', rep._sessid, 'error', err])
        sources.cap()
      })
    )

    var debounce = Debounce(100)
    debounce(function () {
      var d = 0, r = 0, f = 0
      for(var id in to_recv) {
        console.log(to_send, to_recv)
        var S = to_send[id] || 0, R = to_recv[id] || 0
        var D = replicated[id] || 0
        if(to_send[id] != null && to_recv[id] != null) {
          f++; 
          if(S > R) {
            d += (S - R);
            r += (D - R)
          }
        }
      }
      //set_progress({total: d, progress: r, feeds: f})
      //progress is 
      notify({
        type: 'progress', peerid: rpc.id,
        total: d, progress: r, feeds: f,
        sync: !!(f && (r >= d))
      })
    })
    
    var replicated = {}

    pull(
      sources,
      pull.through(function (msg) {
        replicated[msg.author] = Math.max(
          replicated[msg.author]||0,
          msg.sequence
        )
        debounce.set()
      }),
      sbot.createWriteStream(function (err) {
        aborter.abort()
        debounce.immediate()
        cb(err, replicated)
      })
    )
}

module.exports = {
  name: 'replicate',
  version: '1.0.0',
  manifest: {
    changes: 'source'
  },
  replicate: replicate,
  init: function (sbot, config) {
    sbot.createHistoryStream.hook(function (fn, args) {
      if(this._emit)
        this._emit('call:createHistoryStream', args[0])
      return fn.apply(this, args)
    })

    sbot.on('rpc:connect', function(rpc) {
      //this is the cli client, just ignore.
      if(rpc.id === sbot.id) return

      sbot.emit('log:info', ['replicate', rpc._sessid, 'start', rpc.id])
      sbot.emit('replicate:start', rpc)
      replicate(sbot, config, rpc, function (err, progress) {
        if(err) {
          sbot.emit('replicate:fail', err)
          sbot.emit('log:warning', ['replicate', rpc._sessid, 'error', err])
        } else {
          sbot.emit('log:info', ['replicate', rpc._sessid, 'success', progress])
          sbot.emit('replicate:finish', progress)
        }
      })
    })
    
    return {
      changes: function () {
        return notify.listen()
      }
    }
  }
}
