var Blake2s = require('blake2s')
var createHmac = require('hmac')

function createHash() {
  return new Blake2s()
}

module.exports = function (data, key) {
  return createHmac(createHash, 64, key)
    .update(data).digest('base64')+'.blake2s.hmac'
}

