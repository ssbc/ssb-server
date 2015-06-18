var permissions = {
  master: {allow: null, deny: null},
  local: {allow: [
    'emit',
    'getPublicKey',
    'whoami',
    'get',
    'getLatest',
    'add',
    'createFeedStream',
    'createHistoryStream',
    'createLogStream',
    'messagesByType',
    'messagesLinkedToMessage',
    'messagesLinkedToFeed',
    'messagesLinkedFromFeed',
    'feedsLinkedToFeed',
    'feedsLinkedFromFeed',
    'followedUsers',
    'relatedMessages'
  ], deny: null},
  anonymous: {allow: ['emit', 'createHistoryStream'], deny: null}
}

module.exports = function (server) {
  var config = server.config
  var masters = [server.feed.id].concat(config.master).filter(Boolean)

  return function (pub, cb) {
    console.log('AUTHORIZE?', pub)
    if(~masters.indexOf(pub))
      return cb(null, permissions.master)
    else
      server.ssb.sublevel('codes').get(pub, function (err, code) {
        if(err) console.log(err)
        if(code)
          return cb(null, code.permissions)

        cb(null, permissions.anonymous)
      })
  }
}

module.exports.permissions = permissions
