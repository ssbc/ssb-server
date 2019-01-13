var SecretStack = require('secret-stack')

var SSB = require('ssb-db')

//create a sbot with default caps. these can be overridden again when you call create.
function createSsbServer () {
  return SecretStack({ caps: require('./caps') }).use(SSB)
}
module.exports = createSsbServer()

//this isn't really needed anymore.
module.exports.createSsbServer = createSsbServer


