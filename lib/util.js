function isObject (o) {
  return o && typeof o === 'object'
}

var isArray = Array.isArray

exports.find = function find (ary, test) {
  for (var i in ary) {
    if (test(ary[i], i, ary)) {
      return ary[i]
    }
  }
}

var clone = exports.clone = function clone (obj, mapper) {
  function map (v, k) {
    return isObject(v) ? clone(v, mapper) : mapper(v, k)
  }
  if (isArray(obj)) { return obj.map(map) } else if (isObject(obj)) {
    var o = {}
    for (var k in obj) { o[k] = map(obj[k], k) }
    return o
  } else { return map(obj) }
}

exports.merge = function (a, b) {
  // merge a and b objects

  if (isArray(a) !== isArray(b)) {
    throw new Error('cannot merge array with non-array')
  }
  if (isObject(a) !== isObject(b)) {
    throw new Error('cannot merge object with non-object')
  }

  a = clone(a)

  if (isObject(b)) {
    for (var k in b) { a[k] = b }
  }
}
