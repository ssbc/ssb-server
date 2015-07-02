var pull = require('pull-stream')
var pushable = require('pull-pushable')
var many = require('pull-many')
var cat = require('pull-cat')
var Abort = require('pull-abortable')

function replicate(server, rpc, cb) {
    var ssb = server.ssb
    var feed = server.feed
    var config = server.config
    var aborter = Abort()
    var live = !!config.timeout

    var sources = many()
    var sent = 0

    pull(
      server.friends.createFriendStream(),
      aborter,
      ssb.createLatestLookupStream(),
      pull.drain(function (upto) {
        replicated[upto.id] = upto.sequence
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

    var replicated = {}

    pull(
      sources,
      pull.through(function (msg) {
        replicated[msg.author] = Math.max(
          replicated[msg.author]||0,
          msg.sequence
        )
      }),
      ssb.createWriteStream(function (err) {
        aborter.abort()
        cb(err, replicated)
      })
    )
}

module.exports = function (server) {
  server.on('rpc:connect', function(rpc) {
    //do not replicate if we are authorize as server.
    //if(res.type === 'server') return

    var done = rpc.task()
    rpc._emit('replicate:start')
    server.emit('log:info', ['replicate', rpc._sessid, 'start'])
    server.emit('replicate:start', rpc)
    replicate(server, rpc, function (err, progress) {
      if(err) {
        rpc._emit('replicate:fail', err)
        server.emit('replicate:fail', err)
        server.emit('log:warning', ['replicate', rpc._sessid, 'error', err])
      } else {
        rpc._emit('replicate:finish', progress)
        server.emit('log:info', ['replicate', rpc._sessid, 'success', progress])
        server.emit('replicate:finish', progress)
      }
      done()
    })
  })
}

module.exports.replicate = replicate
