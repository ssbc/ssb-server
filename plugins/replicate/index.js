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

      var c = 0

      //to change the replication policy, override this file
      //and make different calls to replicate.request(id)
      //to add things is easy, you just call replicate.request(id)
      //calls to replicate.request(id) are ephemeral,
      //and must be made each time run sbot.
      pull(
        sbot.friends.createFriendStream({live: true, meta: true}),
        // filter out duplicates, and also keep track of what we expect to receive
        // lookup the latest sequence from each user
        // TODO: use paramap?
        pull.drain(function (data) {
          if(data.sync) return
          if(data.hops >= 0)
            replicate.request(data.id)
          else
            replicate.request(data.id, false)
        })
      )

      return replicate
    }
  }
}



