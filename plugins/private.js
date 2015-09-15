var ssbKeys = require('ssb-keys')
var explain = require('explain-error')
var mdm = require('mdmanifest')
var apidoc = require('fs').readFileSync(__dirname + '/private.md', 'utf-8')

module.exports = {
  name: 'private',
  version: '0.0.0',
  manifest: mdm.manifest(apidoc),
  permissions: {
    anonymous: {},
  },
  init: function (sbot, opts) {
    return {
      publish: function (data, recps, cb) {
        var ciphertext
        try { ciphertext = ssbKeys.box(data, recps) }
        catch (e) { return cb(explain(e, 'failed to encrypt')) }

        sbot.publish(ciphertext, cb)
      },
      unbox: function (ciphertext) {
        var data
        try { data = ssbKeys.unbox(ciphertext, sbot.keys.private) }
        catch (e) { throw explain(e, 'failed to decrypt') }
        return data
      }
    }
  }
}