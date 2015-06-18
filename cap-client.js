var toAddress = require('./lib/util').toAddress
var createClient = require('./client')
var ssbKeys = require('ssb-keys')

module.exports = function (cap, manf, cb) {
  console.log(cap)
  cap = cap.split(',')
  var seed = new Buffer(cap.pop(), 'base64')
  var pub = cap.pop()
  var addr = cap.pop()

  var keys = ssbKeys.generate('ed25519', seed)

  var addr = toAddress(addr)
  addr.key = pub
  console.log(keys, addr)
  createClient(keys, manf) (addr, cb)
}
