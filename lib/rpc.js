var muxrpc  = require('muxrpc')
var psc = require('packet-stream-codec')

var serialize = psc

function peerApi (manifest, api) {
  return muxrpc(manifest, manifest, serialize) (api)
}

module.exports = peerApi

module.exports.clientApi = function (manifest, manf, api) {
  return muxrpc(manifest, manf, serialize) (api)
}
