module.exports = {
  name: 'test',
  version: '1.0.0',
  manifest: {
    ping: 'async'
  },
  permissions: {
    master: { allow: ['ping'] }
  },
  init: function (server, config) {
    return {
      ping: function (str, cb) {
        return cb(null, str + ' pong')
      }
    }
  }
}
