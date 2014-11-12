var pull = require('pull-stream')
var many = require('pull-many')
var cat = require('pull-cat')

module.exports = function (server) {

  server.on('rpc-connection', function (rpc, rpcStream) {
    var server = this
    var ssb = this.ssb
    var feed = this.feed

    function replicated () {
      rpc.emit('replicated')
      pull(
        ssb.latest(),
        pull.collect(function (err, ary) {
          if(err) return server.emit('error', err)
          var o = {}
          ary.forEach(function (e) {
            o[e.id.toString('base64')] = e.sequence
          })
          server.emit('replicated', o)
        })
      )
    }

    function latest () {
      return pull(
        cat([
          pull.values([feed.id]),
          pull(
            ssb.feedsLinkedFromFeed(feed.id, 'follow'),
            pull.map(function (link) {
              return link.dest
            })
          )
        ]),
        ssb.createLatestLookupStream()
      )
    }

    rpc.on('replicate', function () {

      var progress = function () {}

      var sources = many()
      var sent = 0
      pull(
        latest(),
        pull.drain(function (upto) {
          sources.add(rpc.createHistoryStream(upto.id, upto.sequence + 1))
        }, function () {
          sources.cap()
        })
      )

      pull(
        sources,
        ssb.createWriteStream(function (err) {
          rpcStream.close(function (err2) {
            //cb(err || err2)
            replicated()
          })
        })
      )

    })

    rpc.emit('replicate')
  })
}
