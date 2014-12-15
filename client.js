var net      = require('pull-ws-server')
var Api      = require('./lib/api')
var manifest = require('./lib/manifest')
var peerApi  = require('./lib/rpc')
var pull     = require('pull-stream')

// createClient  to a peer as a client
// - `address.host`: string, hostname of the target
// - `address.port`: number, port of the target

function isFunction (f) {
  return 'function' === typeof f
}
module.exports = function (address, manf, cb) {
  manf = manf || manifest

  if(isFunction(manf) || !manf)
    cb = manf, manf = manifest

  var addr = {port: address.port, host: address.host || 'localhost'}

  var stream = net.connect(addr, cb)
  var rpc = peerApi.clientApi(manf, {auth: 'async'}, {
    auth: function (req, cb) {
      cb(null, {type: 'server'})
    }
  })
              .permissions({allow: ['auth'], deny: null})
  rpc.client = true
  pull(stream, rpc.createStream(), stream)
  return rpc
}

