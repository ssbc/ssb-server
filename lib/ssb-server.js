var pull     = require('pull-stream')
var toStream = require('pull-stream-to-stream')

var n = 0
module.exports = function(opts, backend) {
  return function (stream) {
    var requestNumber = n++
    console.log('SSB: received replication request #'+requestNumber+', starting stream...')
    var replicationStream = toStream(backend.feed.createReplicationStream({ rel: 'follows' }, function (err, sent, recv, expected) {
      console.log('SSB: finished replication #'+requestNumber, sent, recv, expected)
    }))
    stream.pipe(replicationStream).pipe(stream)
  }
}