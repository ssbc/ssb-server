
var pull = require('pull-stream')

module.exports = function (server) {
  var config = server.config
  var masters = [server.feed.id].concat(config.master).filter(Boolean)

  return function (pub, cb) {
    var permissions = server.permissions
    if(~masters.indexOf(pub)) {
      return cb(null, permissions.master)
    }
    else
      pull(
        server.ssb.links({
          source: server.feed.id,
          rel: 'contact',
          type: 'feed',
          values: true
        }),
//        server.ssb.feedsLinkedFromFeed({
//          id: server.feed.id,
//          //
//          rel: 'contact',
//          message: true
//        }),
        pull.filter(function (op) {
          return op.value.content.flag != null
        }),
        pull.collect(function (err, ary) {
          if(err) throw err
          flagged = ary.pop()
          if(flagged && flagged.value.content.flag)
            cb(new Error('client is blocked!'))
          else
            next()
        })
      )

      function next () {
        server.ssb.sublevel('codes').get(pub, function (err, code) {
          if(code)
            return cb(null, code.permissions)

          cb(null, permissions.anonymous)
        })
      }

  }
}

