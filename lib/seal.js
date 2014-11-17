
var crypto = require('crypto')
var opts = require('secure-scuttlebutt/defaults')
var path = require('path')
var JSONH = require('json-human-buffer')
var deepEqual = require('deep-equal')

function clone (obj) {
  var _obj = {}
  for(var k in obj) {
    if(Object.hasOwnProperty.call(obj, k))
      _obj[k] = obj[k]
  }
  return _obj
}

module.exports = function (opts) {

  function sign (keys, obj) {
    var _obj = clone(obj)
    var str = opts.stringify(_obj, null, 2)
    var h = opts.hash(str, 'utf8')
    _obj.signature = opts.keys.sign(keys, h)
    return _obj
  }

  function createHmac(secret, msgHash) {
    //TODO: use real hmac function.
    return opts.hash(Buffer.concat([secret, msgHash]))
  }

  function signHmac (secret, obj) {
    obj = clone(obj)
    var str = opts.stringify(obj, null, 2)
    var h = opts.hash(str, 'utf8')
    obj.hmac = createHmac(secret, h)
    return obj
  }

  function verifyHmac (secret, obj) {
    obj = clone(obj)
    var hmac = obj.hmac
    delete obj.hmac
    var str = opts.stringify(obj, null, 2)
    var h = opts.hash(str, 'utf8')
    var _hmac = createHmac(secret, h)
    return deepEqual(hmac, _hmac)
  }

  function verify (keys, obj) {
    obj = clone(obj)
    var sig = obj.signature
    delete obj.signature
    var str = opts.stringify(obj, null, 2)
    var h = opts.hash(str, 'utf8')
    return opts.keys.verify(keys, sig, h)
  }

  return {
    sign: sign,
    signHmac: signHmac,
    verify: verify,
    verifyHmac: verifyHmac,
    hash: opts.hash,
  }
}
