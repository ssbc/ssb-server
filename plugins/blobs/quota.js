var pull = require('pull-stream')
var paramap = require('pull-paramap')

module.exports = function (sbot, blobs) {
  var quotas = {}

  //recalculate the quota, with live updates.

  // share a file size between the feeds that link to it.
  // At the time we download it.

  // More feeds might link to it later, and these
  // won't be included in the calculation.
  // but it's simplest to do it this way.

  // this is only in memory, so it will be recalculated
  // when sbot is restarted.

  var total = 0
  var quotas = {}
  var start = Date.now()

  pull(
    blobs.ls({long: true, live: true}),
    paramap(function (data, cb) {
      if(data.sync) {
        return cb(null, data)
      }
      var acc = {}, count = 0
      total += data.size
      pull(
        sbot.links({dest: '&'+data.id}),
        pull.drain(function (link) {
          acc[link.source] = 1 + (acc[link.source] || 0); count ++
          return acc
        }, function (err) {
          if(err) return cb(err)
          var size = data.size
          for(var k in acc)
            quotas[k] = (quotas[k] || 0) + size/(acc[k]/count)
          cb(null, data)
        })
      )
    }),
    pull.drain()
  )

  return quotas
}
