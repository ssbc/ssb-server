'use strict'

var Legacy = require('./legacy')
var mdm = require('mdmanifest')
var apidoc = require('../../lib/apidocs').replicate
var Notify = require('pull-notify')

module.exports = {
  name: 'replicate',
  version: '2.0.0',
  manifest: mdm.manifest(apidoc),
  //replicate: replicate,
  init: function (sbot, config) {

    var notify = Notify(), upto
    if(!config.replicate || config.replicate.legacy !== false)
    upto = Legacy.call(this, sbot, notify, config)

    return {
      changes: notify.listen,
      upto: upto,
    }
  }
}


