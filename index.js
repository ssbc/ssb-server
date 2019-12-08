var SecretStack = require('secret-stack')
var caps = require('ssb-caps')
var SSB = require('ssb-db')

//create a sbot with default caps. these can be overridden again when you call create.
function createSsbServer () {
  return SecretStack({ caps: { shs: Buffer.from(caps.shs, 'base64') } }).use(SSB)
}
module.exports = createSsbServer()

//this isn't really needed anymore.
module.exports.createSsbServer = createSsbServer
