var toAddress = require('./lib/util').toAddress
var createClient = require('./client')
var ssbKeys = require('ssb-keys')

module.exports = function (cap, manf, cb) {
  cap = cap.split('@')
  var seed = new Buffer(cap.pop(), 'base64')
  var addr = toAddress(cap.pop())

  var keys = ssbKeys.generate('ed25519', seed)

  createClient(keys, manf) (addr, cb)
}
