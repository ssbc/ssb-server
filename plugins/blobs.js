var Blobs = require('multiblob')
var path = require('path')
var pull = require('pull-stream')

function toBase64() {
  return pull.map(function (b) { return b.toString('base64') })
}

function toBuffer() {
  return pull.map(function (s) { return new Buffer(s, 'base64') })
}

module.exports = {
  name: 'blobs',
  version: '0.0.0',
  manifest: {
    get: 'source',
    has: 'async',
    add: 'sink',
    ls: 'source'
  },
  permissions: {
    anonymous: {allow: ['has', 'get']},
  },
  init: function (sbot) {

    var want = {}

    function got (hash) {
      if(!want[hash]) return
      var cb = want[hash]
      delete want[hash]
      cb(null, hash)
    }

    var blobs = sbot._blobs = Blobs(path.join(sbot.config.path, 'blobs'))

    sbot.on('rpc:authorised', function (rpc) {
      var want = Object.keys(want)
      var n = 0
      var done = rpc.task()
      if(!want.length)
        rpc.has(want, function (err, ary) {
          ary.forEach(function (e, i) {
            if(!e) return
            n++
            pull(rpc.get(want[i]), blobs.add(want[i]), function (err) {
              if(--n) return
              done()
            })
          })
          
        })
    })

    return {
      get: function (hash) {
        return pull(blobs.get(hash), toBase64())
      },
      has: function (hash, cb) {
        blobs.has(hash, cb)
      },
      add: function (hash) {
        return pull(
          pull.through(console.log),
          toBuffer(),
          blobs.add(function (err, hash) {
            if(err) console.error(err.stack)
            else got(hash)
          })
        )
      },
      ls: function () {
        return blobs.ls()
      },
      // request to retrive a blob,
      // calls back when that file is available.
      want: function (hash, cb) {
        if(!want[hash])
          want[hash] = cb
        else {
          var _cb = want[hash]
          want[hash] = function (err, hash) {
            _cb(err, hash); cb(err, hash)
          }
        }
      }
    }
  }
}
