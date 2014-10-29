var ssbapi = require('secure-scuttlebutt/api')
var Serializer = require('pull-serializer')
var JSONH = require('json-human-buffer')
var muxrpc = require('muxrpc')

function serialize (stream) {
  return Serializer(stream, JSONH, {split: '\n\n'})
}

var manifest = {
  async: [
    'whoami',
  ],

  source: [
  ]
}

exports.client = function () {
  return muxrpc(manifest, null, serialize)()
}

exports.server = function (backend) {
  var api = {
    whoami: function(cb) {
      cb(null, {id: backend.feed.id, public: backend.feed.keys.public})
    }
  }
  return muxrpc(null, manifest, serialize)(api)
}

exports.manifest = manifest
