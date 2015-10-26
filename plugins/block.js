var pull = require('pull-stream')
var valid = require('../lib/validators')

exports.name = 'block'
exports.version = '1.0.0'
exports.manifest = {
  isBlocked  : 'sync',
}

exports.init = function (sbot) {

  //TODO: move other blocking code in here,
  //      i think we'll need a hook system for this.

  //if a currently connected peer is blocked, disconnect them immediately.
  pull(
    sbot.friends.createFriendStream({graph: 'flag', live: true}),
    pull.drain(function (blocked) {
      if(sbot.peers[blocked]) {
        sbot.peers[blocked].forEach(function (b) {
          b.close(true, function () {})
        })
      }
    })
  )

  function isBlocked (_opts) {
    var opts

    if('string' === typeof _opts)
      opts = {
        source: sbot.id, dest: _opts, graph:'flag'
      }
    else opts = {
      source: _opts.source, dest: _opts.dest, graph: 'flag'
    }
    return sbot.friends.get(opts)
  }

  sbot.createHistoryStream.hook(function (fn, args) {
    var opts = args[0], id = this.id
    if(opts.id !== this.id && isBlocked({source: opts.id, dest: this.id}))
      return fn({id: null, sequence: 0})
    else
      return pull(
        fn.apply(this, args),
        //break off this feed if they suddenly block
        //the recipient.
        pull.take(function (msg) {
          //handle when createHistoryStream is called with keys: true
          if(!msg.content && msg.value.content)
            msg = msg.value
          if(msg.content.type !== 'contact') return true
          return !(
            msg.content.flagged &&
            msg.content.contact === id
          )
        })
      )
  })

  sbot.auth.hook(function (fn, args) {
    if(isBlocked(args[0])) args[1](new Error('client is blocked'))
    else return fn.apply(this, args)
  })

  return {isBlocked: valid.sync(isBlocked, 'feedId|isBlockedOpts') }

}
