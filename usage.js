var usage = {
  config: 'config TODO',
  version: 'version TODO',

  add: 'add TODO',
  publish: 'publish TODO',

  get: 'get TODO',
  pub: 'pub TODO',
  getLatest: 'getLatest TODO',
  auth: 'auth TODO',
  relatedMessages: 'relatedMessages TODO',

  getAddress: 'getAddress TODO',
  whoami: 'whoami TODO',

  //local nodes
  getLocal: 'getLocal TODO',

  latest: 'latest TODO',
  query: 'query TODO',
  feed: 'feed TODO',
  hist: 'hist TODO',
  log: 'log TODO',
  links: 'links TODO',
  createUserStream: 'createUserStream TODO',
  messagesByType: 'messagesByType TODO',
}


function values (obj) {
  var arr = []
  for (var k in obj)
    arr.push(obj[k])
  return arr
}

module.exports = function (cmd) {
  if (cmd in usage)
    return usage[cmd]
  return 'sbot commands:\n  ' + values(usage).join('\n  ')
}