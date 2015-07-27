var net       = require('./lib/net')
var Api       = require('./lib/api')
var manifest  = require('./lib/manifest')
var peerApi   = require('./lib/rpc')
var pull      = require('pull-stream')
var toAddress = require('./lib/util').toAddress

var handshake = require('secret-handshake')
var ssbCap    = require('./lib/ssb-cap')
var hash      = require('ssb-keys').hash

// createClient  to a peer as a client
// - `address.host`: string, hostname of the target
// - `address.port`: number, port of the target
// - `address.key` : Buffer[32], public key of the target

var isBuffer = Buffer.isBuffer

function toBuffer(base64) {
  return new Buffer(base64.substring(0, base64.indexOf('.')), 'base64')
}

function toSodiumKeys (keys) {
  return {
    publicKey: toBuffer(keys.public),
    secretKey: toBuffer(keys.private)
  }
}

function isFunction (f) {
  return 'function' === typeof f
}

module.exports = function (keys, manf) {
  if(!keys || (!keys.private || !keys.public))
    throw new Error('must have public/private keys')

  var createClientStream = handshake.client(toSodiumKeys(keys), ssbCap)
  manf = manf || manifest
  return function (address, cb) {
    var publicKey = toBuffer(address.key)
    if(!isBuffer(publicKey))
      return cb(new Error('*must* have remote public key'))

    var stream = net.connect(toAddress(address))

    pull(
      stream,
      createClientStream(publicKey, function (err, secure) {
        if(err) return cb(err)

        var rpc = peerApi.clientApi(manf, {}, {allow: ['emit'], deny: null})
        rpc.id = address.key
        rpc.address = address

        rpc.client = true
        //match the server's way of tracking rpc direction.
        //I don't know if we'll need this, but for consistency.
        pull(secure, rpc.createStream(), secure)
        cb(null, rpc)
      }),
      stream
    )
  }
}

