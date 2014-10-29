var ssbapi = require('secure-scuttlebutt/api')
var Serializer = require('pull-serializer')
var JSONH = require('json-human-buffer')
var muxrpc = require('muxrpc')

function serialize (stream) {
  return Serializer(stream, JSONH, {split: '\n\n'})
}

var manifest = {
  async: [
    'debug'
  ],

  source: [
  ]
}

exports.client = function () {
  return muxrpc(manifest, null, serialize)()
}

exports.server = function (backend) {
  // create core ssb api
  var api = {
    debug: function(str, cb) {
      str = str || ''
      console.log('DEBUG got', str)
      cb(null, str.toUpperCase())
    }
  }
  return muxrpc(null, manifest, serialize)(api)
}

exports.manifest = manifest
