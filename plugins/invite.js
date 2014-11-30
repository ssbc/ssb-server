
//okay this plugin adds a method
//invite(seal({code, public})


module.exports = {
  name: 'invite',
  version: '1.0.0',
  manifest: {
    async: ['followMe']
  },
  init: function (server) {
    return {
      followMe: function (req, cb) {
        console.log('follow', req)
        cb()
      }
    }
  }
}

