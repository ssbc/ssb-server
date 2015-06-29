var muxrpc  = require('muxrpc')

function peerApi (manifest, api) {
  return muxrpc(manifest, manifest) (api)
}

module.exports = peerApi

module.exports.clientApi = function (manifest, manf, api) {
  return muxrpc(manifest, manf) (api)
}
