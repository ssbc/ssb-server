exports.name = 'onion'
exports.version = '1.0.0'
exports.init = function (ssk, config) {
  var Onion = require('multiserver/plugins/onion')

  ssk.multiserver.transport({
    name: 'onion',
    create: function (conf) {
      return Onion(conf)
    }
  })
}
