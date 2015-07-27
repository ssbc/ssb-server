var pull = require('pull-stream')

exports.name = 'block'
exports.version = '1.0.0'
exports.manifest = {
  isBlocked  : 'sync',
}

exports.init = function (sbot) {

  //TODO: move other blocking code in here,
  //      i think we'll need a hook system for this.

  //if a connected peer is blocked, disconnect them immediately.
  pull(
    sbot.friends.createFriendStream({graph: 'flag'}),
    pull.drain(function (blocked) {
      if(sbot.peers[blocked]) {
        sbot.peers[blocked].forEach(function (b) {
          b.close(true, function () {
            console.log('disconnected!', blocked)
          })
        })
      }
    })
  )

  return {
    isBlocked: function (_opts) {
      var opts
      if('string' === typeof _opts)
        opts = {
          source: sbot.feed.id, dest: _opts, graph:'flag'
        }
      else opts = {
        source: _opts.source, dest: _opts.dest, graph: 'flag'
      }
      return sbot.friends.get(opts)
    }

  }

}
