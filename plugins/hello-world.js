console.log('hello, world!')
console.log(this)
exports.ping = function (cb) {
  cb(null, 'pong')
}