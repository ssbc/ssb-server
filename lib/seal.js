

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

function sign (keys, obj) {
  var _obj = clone(obj)
//  _obj.signer = opts.hash(keys.public)
  var str = JSONH.stringify(_obj, null, 2)
  var h = opts.hash(str, 'utf8')
  _obj.signature = opts.keys.sign(keys, h)
  return _obj
}

function verify (keys, obj) {
  obj = clone(obj)
//  if(!deepEqual(opts.hash(keys.public), obj.signer))
//    return false
  var sig = obj.signature
  delete obj.signature
  var str = JSONH.stringify(obj, null, 2)
  var h = opts.hash(str, 'utf8')
  
  return opts.keys.verify(keys, sig, h)
}

exports.sign = sign
exports.verify = verify
exports.hash = opts.hash

if(!module.parent && 'browser' !== process.title) {
  var pkg = require('./package.json')
  var keys = require('ssb-keys')
    .loadSync(path.join(process.env.HOME, '.scuttlebot', 'secret'))

  var signed = sign(keys, pkg)
  console.log(JSONH.stringify(signed, null, 2))
  console.error(verify(keys, signed))
}
