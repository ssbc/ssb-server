var pull = require('pull-stream')
var paramap = require('pull-paramap')

module.exports = function (sbot, blobs, quotas, cb) {
  var listeners = []

  //recalculate the quota, with live updates.

  // share a file size between the feeds that link to it.
  // At the time we download it.

  // More feeds might link to it later, and these
  // won't be included in the calculation.
  // but it's simplest to do it this way.

  // this is only in memory, so it will be recalculated
  // when sbot is restarted.

  var total = 0
  var start = Date.now()
  var inflight = 0

  pull(
    blobs.ls({long: true, live: true}),
    paramap(function (data, cb) {
      if(data.sync) return cb(null, data)

      var acc = {}, count = 0
      total += data.size

      inflight ++
      pull(
        sbot.links({dest: '&'+data.id}),
        pull.drain(function (link) {
          if(!acc[link.source]) {
            acc[link.source] = true
            count ++
          }
          return acc
        }, function (err) {
          inflight --
          if(err) return cb(err)
          var size = data.size
          for(var k in acc)
            quotas[k] = (quotas[k] || 0) + size/count

          if(inflight === 0)
            while (listeners.length) listeners.shift()()

         cb(null, data)
        })
      )
    }),
    pull.drain()
  )

  return function (listener) {
    if(!inflight) listener()
    else          listeners.push(listener)
  }
}
