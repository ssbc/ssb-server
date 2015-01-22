'use strict'

var Blobs = require('multiblob')
var path = require('path')
var pull = require('pull-stream')
var isHash = require('ssb-keys').isHash

function isFunction (f) {
  return 'function' === typeof f
}

function toBase64() {
  return pull.map(function (b) { return b.toString('base64') })
}

function toBuffer() {
  return pull.map(function (s) { return Buffer.isBuffer(s) ? s : new Buffer(s, 'base64') })
}

function each (obj, iter) {
  for(var k in obj)
    iter(obj[k], k, obj)
}

function id (e) {
  return !!e
}

function first(obj, iter) {
  iter = iter || id
  for(var k in obj)
    if(iter(obj[k], k, obj))
      return obj[k]
}

function firstKey(obj, iter) {
  iter = iter || id
  for(var k in obj)
    if(iter(obj[k], k, obj))
      return k
}

function isFunction (f) {
  return 'function' === typeof f
}

function oneTrack(delay, fun) {
  if(isFunction(delay))
    fun = delay, delay = 1000

  var doing = false, timeout

  function job () {
    if(doing) return
    doing = true
    clearTimeout(timeout); timeout = null

    fun(function (done) {
      doing = false
      if(done) {
        clearTimeout(timeout); timeout = null
        return
      }
      if(timeout) return
      timeout = setTimeout(job, Math.round(delay*Math.random()))
    })

  }

  job.abort = function () {
    clearTimeout(timeout)
  }

  return job
}

module.exports = {
  name: 'blobs',
  version: '0.0.0',
  manifest: {
    get: 'source',
    has: 'async',
    add: 'sink',
    ls: 'source',
    want: 'async',
    wants: 'sync'
  },
  permissions: {
    anonymous: {allow: ['has', 'get']},
  },
  init: function (sbot) {

    var want = {}
    var jobs = []

    function got (hash) {
      sbot.emit('blobs:got', hash)
      sbot.emit('log:info', ['blobs', null, 'got', hash])

      each(remotes, function (rpc) {
        rpc.emit('blobs:got', hash)
      })

      if(!want[hash]) return
      var cbs = want[hash].waiting
      delete want[hash]
      var i = +firstKey(jobs, function (e) { return e.id == hash })
      jobs.splice(i, 1)
      cbs.forEach(function (cb) {
        cb()
      })
    }

    var blobs = sbot._blobs = Blobs(path.join(sbot.config.path, 'blobs'))

    pull(
      sbot.ssb.externalsLinkedFromFeed({live: true}),
      pull.drain(function (data) {
        var hash = data.dest
        if(isHash(hash))
          blobs.has(hash, function (_, has) {
            if(!has) queue(hash, function () {})
          })
      })
    )

    // query worker

    var remotes = {}

    sbot.on('rpc:authorized', function (rpc) {
      var id = rpc.authorized.id
      remotes[id] = rpc
      //forget any blobs that they did not have
      //in previous requests. they might have them by now.
      each(want, function (e, k) {
        if(e.has && e.has[id] === false) delete e.has[id]
      })
      query(); download()
      var done = rpc.task()
      rpc.once('closed', function () {
        delete remotes[id]
      })

      //when the peer gets a blob, if its one we want,
      //then request it.
      rpc.on('blobs:got', function (hash) {
        if(want[hash]) {
          want[hash].has = want[hash].has || {}
          want[hash].has[id] = true
          if(want[hash].state === 'waiting')
            want[hash].state = 'ready'
          download()
        }
      })
    })

    function getWantList(state, n) {
      return jobs
        .filter(function (j) {
          return j.state === state
        })
        .sort(function () {
          return (Math.random()*2) - 1
        })
        .slice(0, n || 20)
    }

    var query = oneTrack(function (done) {
      var wantList = getWantList('waiting')
        .map(function (e) { return e.id })

      if(!wantList.length) return done(true)

      var n = 0
      each(remotes, function (remote, id) {
        n++
        var thisWantList = wantList.filter(function (key) {
          return (
            !want[key].has ||
            want[key].has[id] == null
          )
        })

        if(!thisWantList.length) next()
        else {
          remote.blobs.has(thisWantList, function (err, hasList) {
            if(hasList)
              wantList.forEach(function (key, i) {
                want[key].has = want[key].has || {}
                want[key].has[id] = hasList[i]
                if(hasList[i] && want[key].state === 'waiting') {
                  want[key].state = 'ready'
                  sbot.emit('log:info', ['blobs', id, 'found', key])
                }
              })
            next()
          })
        }

        function next () {
          if(--n) return
          done(); download()
        }
      })

      if(!n) done()
    })

    var download = oneTrack(function (done) {
      var wantList = getWantList('ready')
        .filter(function (e) {
          return first(e.has, function (has, k) {
            return has && remotes[k]
          })
        })

      if(!wantList.length) return done(true)

      var f = wantList.shift()

      var id = firstKey(f.has)
      sbot.emit('log:info', ['blobs', id, 'downloading', f.id])
      pull(
        remotes[id].blobs.get(f.id),
        toBuffer(),
        //TODO: error if the object is longer than we expected.
        blobs.add(f.id, function (err, hash) {
          if(err) console.error(err.stack)
          else got(hash)
        })
      )
    })

    function queue (hash, cb) {
      sbot.emit('log:info', ['blobs', null, 'want', hash])
      if(want[hash]) {
        want[hash].waiting.push(cb)
      }
      else
        jobs.push(want[hash] = {
          id: hash, waiting: [cb], state: 'waiting'
        })

      query()
    }

    sbot.on('close', download.abort)
    sbot.on('close', query.abort)


    return {
      get: function (hash) {
        return pull(blobs.get(hash), toBase64())
      },

      has: function (hash, cb) {
        sbot.emit('blobs:has', hash)
        blobs.has(hash, cb)
      },

      size: function (hash, cb) {
        sbot.emit('blobs:size', hash)
        blobs.size(hash, cb)
      },

      add: function (hash, cb) {
        if(isFunction(hash)) cb = hash, hash = null

        return pull(
          toBuffer(),
          blobs.add(function (err, hash) {
            if(err) console.error(err.stack)
            else got(hash)
            // sink cbs are not exposed over rpc
            // so this is only available when using this api locally.
            if(cb) cb(err, hash)
          })
        )
      },

      ls: function () {
        return blobs.ls()
      },
      // request to retrive a blob,
      // calls back when that file is available.
      want: function (hash, cb) {
        if(!isHash(hash)) return cb(new Error('not a hash:' + hash))

        blobs.has(hash, function (_, has) {
          if(has) return cb()
          queue(hash, cb)
        })
      },

      // get current want list
      wants: function () {
        return jobs
      }
    }
  }
}
