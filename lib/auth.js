
module.exports = function (server) {
  var config = server.config
  var masters = [server.feed.id].concat(config.master).filter(Boolean)


  return function (pub, cb) {
    var permissions = server.permissions
    if(~masters.indexOf(pub)) {
      return cb(null, permissions.master)
    }
    else
      server.ssb.sublevel('codes').get(pub, function (err, code) {
        if(code)
          return cb(null, code.permissions)

        cb(null, permissions.anonymous)
      })
  }
}

