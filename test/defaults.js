//defaults only used in the tests!

var crypto = require('crypto')
function hash(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest()
}

module.exports = {
  caps: {
    shs: hash('test default shs'),
    sign: hash('test default sign'),
  }
}

