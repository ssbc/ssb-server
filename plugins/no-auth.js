
exports.name = 'no-auth'
exports.version = '1.0.0'
exports.init = function (ssk, config) {
  var Noauth = require('multiserver/plugins/noauth')

  ssk.multiserver.transform({
    name: 'noauth',
    create: function () {
      return Noauth({
        keys: {
          publicKey: Buffer.from(config.keys.public, 'base64')
        }
      })
    }
  })
}
