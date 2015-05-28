var pull = require('pull-stream')
var pushable = require('pull-pushable')
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
            o[e.id] = e.sequence
          })
          cb(null, o)
        })
      )
    }

    function latest () {
      var ps = pushable()
      if(false) {
        server.friends.hops(null, 'follow', function (err, friends) {
          if (friends) {
            for (var k in friends)
              ps.push(k)
          }
          //ps.end()
        })
      } else {
        return pull(
          server.friends.createFriendStream(),
          pull.unique(),
          ssb.createLatestLookupStream()
        )
      }

      return pull(
        ps,
        ssb.createLatestLookupStream()
      )
    }

    var progress = function () {}

    var sources = many()
    var sent = 0
    pull(
      latest(),
      pull.drain(function (upto) {
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

    pull(
      sources,
      ssb.createWriteStream(function (err) {
        replicated()
      })
    )
}

module.exports = function (server) {
  server.on('rpc:authorized', function(rpc, res) {
    //do not replicate if we are authorize as server.
    if(res.type === 'server') return

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
