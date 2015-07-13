var muxrpc  = require('muxrpc')

function peerApi (manifest, api, perms) {
  return muxrpc(manifest, manifest) (api, perms)
}

module.exports = peerApi

module.exports.clientApi = function (manifest, manf, api, perms) {
  return muxrpc(manifest, manf) (api, perms)
}
