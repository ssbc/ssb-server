var pull = require('pull-stream')
var pushable = require('pull-pushable')
var many = require('pull-many')
var cat = require('pull-cat')
var Abort = require('pull-abortable')
var Debounce = require('observ-debounce')
var Observ = require('observ')

function replicate(server, rpc, cb) {
    var ssb = server.ssb
    var feed = server.feed
    var config = server.config
    var aborter = Abort()
    var live = !!config.timeout

    var sources = many()
    var sent = 0

    var to_send = {}, to_recv = {}

    rpc.on('call:createHistoryStream', function (opts) {
      to_send[opts.id] = (opts.sequence || opts.seq) - 1
    })

    rpc.progress = Observ()

    var set_progress = rpc.progress.set
    delete rpc.progress.set

    rpc._emit('replicate:progress', rpc.progress)

    //these defaults are for replication
    //so they belong in the replication config
    var opts = config.replication || {}
    opts.hops = opts.hops || 3
    opts.dunbar = opts.dunbar || 150

    pull(
      server.friends.createFriendStream(opts),
      aborter,
      pull.through(function (s) {
        to_recv[s] = 0
      }),
      ssb.createLatestLookupStream(),
      pull.drain(function (upto) {
        to_recv[upto.id] = upto.sequence
        //replicated[upto.id] = upto.sequence
        sources.add(rpc.createHistoryStream({
          id: upto.id, seq: upto.sequence + 1,
          live: live, keys: false
        }))
      }, function (err) {
        if(err)
          server.emit('log:error', ['replication', rep._sessid, 'error', err])
        sources.cap()
      })
    )

    var debounce = Debounce(100)
    debounce(function () {
      var d = 0, r = 0
      for(var id in to_recv) {
        var S = to_send[id] || 0, R = to_recv[id] || 0
        var D = replicated[id] || 0
        if(to_send[id] != null && to_recv[id] != null && S > R) {
          d += (S - R); r += (D - R)
        }
      }
      set_progress({total: d, progress: r})
    })
    var progress = debounce.set

    var replicated = {}

    pull(
      sources,
      pull.through(function (msg) {
        replicated[msg.author] = Math.max(
          replicated[msg.author]||0,
          msg.sequence
        )
        progress()
      }),
      ssb.createWriteStream(function (err) {
        aborter.abort()
        progress ()
        cb(err, replicated)
      })
    )
}

module.exports = function (server) {
  server.on('rpc:connect', function(rpc) {
    //do not replicate if we are authorize as server.
    //if(res.type === 'server') return

    var done = rpc.task()
    server.emit('log:info', ['replicate', rpc._sessid, 'start'])
    server.emit('replicate:start', rpc)
    replicate(server, rpc, function (err, progress) {
      if(err) {
        server.emit('replicate:fail', err)
        server.emit('log:warning', ['replicate', rpc._sessid, 'error', err])
      } else {
        server.emit('log:info', ['replicate', rpc._sessid, 'success', progress])
        server.emit('replicate:finish', progress)
      }
      done()
    })
  })
}

module.exports.replicate = replicate
