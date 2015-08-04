var ssbKeys = require('ssb-keys')
var explain = require('explain-error')

module.exports = {
  name: 'private',
  version: '0.0.0',
  manifest: {
    publish: 'async',
    unbox: 'sync'
  },
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