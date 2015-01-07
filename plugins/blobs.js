'use strict'

var Blobs = require('multiblob')
var path = require('path')
var pull = require('pull-stream')

function toBase64() {
  return pull.map(function (b) { return b.toString('base64') })
}

function toBuffer() {
  return pull.map(function (s) { return Buffer.isBuffer(s) ? s : new Buffer(s, 'base64') })
}

/*
ideas

so what I currently have works well for the client-server api
but not the peer-peer api.

when the node sees a file they want (mentioned in their feed)
they add it to a work queue...

items in the queue can have states:
waiting, querying, downloading

waiting
  - have not requested this from anyone yet.
querying
  - ask nodes if they have this object.
    this task is only light, so just ask all the current peers.
downloading
  - request this object from particular node.

there needs to be some rate limiting thing, like, handle only N
tasks at once... maybe querying and downloading are handled separately.

track when changes to state occur, and work on those first.

---

handle each stage differently:

* query
  the querier checks whether a key is available on which nodes.
  it goes over the list of keys, and then queries whether a given
  peer has that or not.

  it might collect a bunch of waiting items before querying in a batch.

* downloading
  download from random peer, if download fails, try different peer.
  prefer peers on local network first.

  should only try to download a file from one peer at a time.

*/

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

  return function job () {
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
}

module.exports = {
  name: 'blobs',
  version: '0.0.0',
  manifest: {
    get: 'source',
    has: 'async',
    add: 'sink',
    ls: 'source',
    want: 'async'
  },
  permissions: {
    anonymous: {allow: ['has', 'get']},
  },
  init: function (sbot) {

    var want = {}
    var jobs = []

    function got (hash) {
      sbot.emit('blobs:got', hash)
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

    // query worker

    var remotes = {}

    sbot.on('rpc:authorized', function (rpc) {
      var id = rpc.authorized.id
      remotes[id] = rpc
      query(); download()
      var done = rpc.task()
      rpc.once('closed', function () {
        console.log('CLOSE!', id)
        delete remotes[id]
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

      console.log("QUERY!", jobs)
      if(!wantList.length) return done(true)

      var n = 0
      each(remotes, function (remote, id) {
        n++
        remote.blobs.has(wantList, function (err, hasList) {
          console.log('READY', wantList, hasList)
          try {
            if(hasList)
              wantList.forEach(function (key, i) {
                want[key].has = want[key].has || {}
                want[key].has[id] = hasList[i]
                if(hasList[i] && want[key].state === 'waiting')
                  want[key].state = 'ready'
              })
            console.log('want', want, jobs)
          } catch (err) {
            console.error(err)
          }
          if(--n) return
          done(); download()

        })
      })

      if(!n) done()
    })

    var download = oneTrack(function (done) {
      var wantList = getWantList('ready')
        .filter(function (e) {
          return first(e.has, function (_, k) {
            return remotes[k]
          })
        })
      console.log("DL", wantList, Object.keys(remotes))
      if(!wantList.length) return done(true)

      var f = wantList.shift()

      var id = firstKey(f.has)
      pull(
        remotes[id].blobs.get(f.id),
        toBuffer(),
        blobs.add(f.id, function (err, hash) {
          if(err) console.error(err.stack)
          else got(hash)
        })
      )
    })

    function queue (hash, cb) {
      if(want[hash]) {
        want[hash].waiting.push(cb)
      }
      else
        jobs.push(want[hash] = {
          id: hash, waiting: [cb], state: 'waiting'
        })


      console.log('QUEUE', jobs)

      query()
    }

    return {
      get: function (hash) {
        return pull(blobs.get(hash), toBase64())
      },

      has: function (hash, cb) {
        blobs.has(hash, cb)
      },

      add: function (hash, cb) {
        return pull(
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
        blobs.has(hash, function (_, has) {
          if(has) return cb()
          queue(hash, cb)
        })
      }
    }
  }
}
