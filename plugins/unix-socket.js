
exports.name = 'unix-socket'
exports.version = '1.0.0'
exports.init = function (ssk, config) {
  var Unix = require('multiserver/plugins/unix-socket')
  ssk.multiserver.transport({
    name: 'unix',
    create: function (conf) {
      return Unix(Object.assign(Object.assign({}, conf), config))
    }
  })
}
