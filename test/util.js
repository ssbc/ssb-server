var ref = require('ssb-ref')
var ma = require('multiserver-address')

exports.follow = function (id) {
  return {
    type: 'contact', contact: id, following: true
  }
}
exports.unfollow = function (id) {
  return {
    type: 'contact', contact: id, following: false
  }
}
exports.block = function unfollow(id) {
  return {
    type: 'contact', contact: id, flagged: true
  }
}

exports.pub = function (address) {
  return {
    type: 'pub',
    address: ma.decode(address)
  }
}

exports.file = function (hash) {
  return {
    type: 'file',
    file: hash
  }
}

