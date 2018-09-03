'use strict'

var Legacy = require('./legacy')
var mdm = require('mdmanifest')
var apidoc = require('../../lib/apidocs').replicate
var Notify = require('pull-notify')

module.exports = {
  name: 'replicate',
  version: '2.0.0',
  manifest: mdm.manifest(apidoc),
  // replicate: replicate,
  init: function (sbot, config) {
    var notify = Notify()
    // if ssb-ebt is used, config.replicate is set by ssb-ebt.
    if (!config.replicate || config.replicate.legacy !== false) {
      var replicate = Legacy.call(this, sbot, notify, config)

      // replication policy is set by calling
      // sbot.replicate.request(id)
      // or by cancelling replication
      // sbot.replicate.request(id, false)
      // this is currently performed from the ssb-friends plugin

      return replicate
    } else {
      return {
        // This is hooked in ssb-ebt to trigger ebt replication. That's why this function is empty. Ebt does the replication.
        request: function () {},
        changes: function () { return function (abort, cb) { cb(true) } }
      }
    }
  }
}
