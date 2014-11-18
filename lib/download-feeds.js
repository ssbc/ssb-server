var pull = require('pull-stream')
var many = require('pull-many')
var cat = require('pull-cat')

function latest (server) {
  return pull(
    cat([
      pull.values([server.feed.id]),
      pull(
        server.ssb.feedsLinkedFromFeed(server.feed.id, 'follow'),
        pull.map(function (link) {
          return link.dest
        })
      )
    ]),
    server.ssb.createLatestLookupStream()
  )
}

// downloadFeeds
// connects to the given address and pulls latest values for all followed feeds
// - `addr`: required, object, either `{addr:, port:}` or a `client` returned from `scuttlebot.connect()`
// - `cb`: function(err, results)
// :TODO: make `latest()` an optional parameter?
module.exports = function (addr, cb) {
  var server = this
  var ssb = this.ssb
  var feed = this.feed
  cb = cb || function(err){ if (err) throw err }

  var client, rpc, rpcStream
  if (addr.host) {
    // connect to target
    client = server.connect(addr)
    rpc = client.rpc
    rpcStream = client.rpcStream
    client.socket.on('error', function(err) {
      rpcStream.close(function(){})
      cb(err)
    })
    client.socket.on('open', replicate)
  } else {
    client = addr
    rpc = client.rpc
    rpcStream = client.rpcStream
    replicate(true)
  }

  function replicate(stayOpen) {

    // create history streams for all feeds possible
    var progress = function () {}
    var sources = many()
    var sent = 0
    pull(
      latest(server),
      pull.drain(function (upto) {
        sources.add(rpc.createHistoryStream(upto.id, upto.sequence + 1))
      }, function () {
        sources.cap()
      })
    )

    // pull streams into the 
    pull(
      sources,
      ssb.createWriteStream(function (err) {
        // :TODO: handle err?
        if (stayOpen)
          return replicated()
        rpcStream.close(function (err2) {
          // :TODO: handle err2?
          replicated()
        })
      })
    )

    function replicated () {
      pull(
        ssb.latest(), // :TODO: should this be the same latest() as before?
        pull.collect(function (err, ary) {
          if(err) return server.emit('error', err)
          var o = {}
          ary.forEach(function (e) {
            o[e.id.toString('base64')] = e.sequence
          })
          server.emit('replicated', o)
          cb(null, o)
        })
      )
    }
  }

}
