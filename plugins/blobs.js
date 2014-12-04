var Blobs = require('multiblob')
var path = require('path')
var pull = require('pull-stream')

function toBase64() {
  return pull.map(function (b) { return b.toString('base64') })
}

function toBuffer() {
  return pull.map(function (s) { return Buffer.isBuffer(s) ? s : new Buffer(s, 'base64') })
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
      sbot.emit('blobs:got', hash)
      if(!want[hash]) return
      var cb = want[hash]
      delete want[hash]
      cb(null, hash)
    }

    var blobs = sbot._blobs = Blobs(path.join(sbot.config.path, 'blobs'))

    sbot.on('rpc:authorized', function (rpc) {
      var wantList = Object.keys(want)
      var n = 0
      var done = rpc.task()
      console.log('wants', wantList)
      if(!wantList.length) return setTimeout(done, 3000)

      rpc.blobs.has(wantList, function (err, ary) {
        if(err) {
          //this could mhappen
          console.error(err.stack)
          return done()
        }
        ary.forEach(function (e, i) {
          if(!e) return
          n++
          pull(
            rpc.blobs.get(wantList[i]),
            toBuffer(),
            pull.through(console.log),
            blobs.add(wantList[i], function (err, hash) {
              if(err) console.error(err.stack)
              else got(hash)

              if(--n) return
              done()
            })
          )
        })
      })
    })

    return {
      get: function (hash) {
        console.log('GET', hash)
        return pull(blobs.get(hash), toBase64())
      },

      has: function (hash, cb) {
        blobs.has(hash, cb)
      },

      add: function (hash, cb) {
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
        console.log('want', hash)
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
