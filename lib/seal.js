
var crypto = require('crypto')
var path = require('path')
var hmac = require('hmac')
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
    var str = JSON.stringify(_obj, null, 2)
    var h = opts.hash(str, 'utf8')
    _obj.signature = opts.sign(keys, h)
    return _obj
  }

  function signHmac (secret, obj) {
    obj = clone(obj)
    var str = JSON.stringify(obj, null, 2)
    obj.hmac = opts.hmac(str, secret)
    return obj
  }

  function verifyHmac (secret, obj) {
    obj = clone(obj)
    var hmac = obj.hmac
    delete obj.hmac
    var str = JSON.stringify(obj, null, 2)
    var _hmac = opts.hmac(str, secret)
    return deepEqual(hmac, _hmac)
  }

  function verify (keys, obj) {
    obj = clone(obj)
    var sig = obj.signature
    delete obj.signature
    var str = JSON.stringify(obj, null, 2)
    var h = opts.hash(str, 'utf8')
    return opts.verify(keys, sig, h)
  }

  return {
    sign: sign,
    signHmac: signHmac,
    verify: verify,
    verifyHmac: verifyHmac,
    hash: opts.hash,
  }
}
