var muxrpc  = require('muxrpc')
var Serializer = require('pull-serializer')

function serialize (stream) {
  return Serializer(stream, JSON, {split: '\n\n'})
}

function serialize (stream) {
  return Serializer(stream, JSON, {split: '\n\n'})
}

function peerApi (manifest, api) {
  return muxrpc(manifest, manifest, serialize) (api)
}

module.exports = peerApi

module.exports.clientApi = function (manifest, manf, api) {
  return muxrpc(manifest, manf, serialize) (api)
}
