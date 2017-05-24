'use strict'

var Legacy = require('./legacy')
var mdm = require('mdmanifest')
var apidoc = require('../../lib/apidocs').replicate
var Notify = require('pull-notify')
var pull = require('pull-stream')

module.exports = {
  name: 'replicate',
  version: '2.0.0',
  manifest: mdm.manifest(apidoc),
  //replicate: replicate,
  init: function (sbot, config) {
//    var change = Obv()
    var notify = Notify(), upto
    if(!config.replicate || config.replicate.legacy !== false) {
      var replicate = Legacy.call(this, sbot, notify, config)

      pull(
        sbot.friends.createFriendStream({live: true, meta: false}),
        // filter out duplicates, and also keep track of what we expect to receive
        // lookup the latest sequence from each user
        // TODO: use paramap?
        pull.drain(function (id) {
          if(id.sync) return
          replicate.request(id)
        })
      )

      return replicate
    }
  }
}

