var pull = require('pull-stream')
var many = require('pull-many')
var cat = require('pull-cat')

function replicate(server, rpc, cb) {
    var ssb = server.ssb
    var feed = server.feed
    var config = server.config

    var live = !!config.timeout

    function replicated () {

      pull(
        ssb.latest(),
        pull.collect(function (err, ary) {
          if(err) cb(err)
          var o = {}
          ary.forEach(function (e) {
            o[e.id.toString('base64')] = e.sequence
          })
          cb(null, o)
        })
      )
    }

    function latest () {
      return pull(
        pull.values(Object.keys(server.friends.hops())),
        ssb.createLatestLookupStream()
      )
    }

    var progress = function () {}

    var sources = many()
    var sent = 0
    pull(
      latest(),
      pull.drain(function (upto) {
        sources.add(rpc.createHistoryStream({id: upto.id, seq: upto.sequence + 1, live: live}))
      }, function (err) {
        if(err) console.log(err.stack)
        sources.cap()
      })
    )

    pull(
      sources,
      ssb.createWriteStream(function (err) {
        replicated()
      })
    )
}

module.exports = function (server) {
  server.on('rpc:authorized', function(rpc) {
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
