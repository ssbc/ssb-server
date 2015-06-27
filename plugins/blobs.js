'use strict'

var Blobs = require('multiblob')
var path = require('path')
var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var isHash = require('ssb-keys').isHash
var multicb = require('multicb')
var Notify = require('pull-notify')

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

// returns a function which...
// - only acts if not already acting
// - automatically requeues if the task is not yet done
// - `delay`: ms, amount of time to wait before calling again
// - `n`: number, amount of simultaneous calls allowed
// - `label`: string, name of the task (for logging)
// - `fun`: function(cb(done?)), calls cb(true) when done, cb(false) when needs to requeue
function oneTrack(delay, n, label, fun) {
  var doing = 0, timeout

  function job () {
    // abort if already doing too many
    if(doing >= n) return
    doing++

    // dont bother waiting anymore
    clearTimeout(timeout); timeout = null

    // run the behavior
    fun(function (done) {
      doing--
      if(done) {
        // we're done, dont requeue
        clearTimeout(timeout); timeout = null
        return
      }

      // requeue after a delay
      if(timeout) return
      var wait = ~~(delay/2 + delay*Math.random())
      console.log(label, 'waiting...', wait)
      timeout = setTimeout(job, wait)
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
    wants: 'sync',
    changes: 'source',
  },
  permissions: {
    anonymous: {allow: ['has', 'get', 'changes']},
    local: {allow: ['has', 'get', 'changes']}
  },
  init: function (sbot) {

    var notify = Notify()
    var config = sbot.config
    var remotes = {} // connected peers (rpc objects)
    var blobs = sbot._blobs = Blobs(path.join(sbot.config.path, 'blobs'))
    var wantList = (function (){
      var wL = {
        byId: {}, // [hash] => {blob state}
        jobs: [] // ordered queue of {blob state}
      }

      // provides a random subset of the current state
      // - `state` string
      // - `n` number (default 20) max subset length
      wL.subset = function (state, n) {
        return wL.jobs
          .filter(function (j) { return j.state === state })
          .sort(function () { return (Math.random()*2) - 1 })
          .slice(0, n || 20)
      }

      wL.each = function (iter) { 
        return each(wL.byId, iter)
      }

      wL.wants = function (hash) {
        return (hash in wL.byId)
      }

      // adds a blob to the want list
      wL.queue = function (hash, cb) {
        if(wL.byId[hash]) {
          wL.byId[hash].waiting.push(cb)
        }
        else {
          sbot.emit('log:info', ['blobs', null, 'want', hash])
          wL.jobs.push(wL.byId[hash] = {
            id: hash, waiting: [cb], state: 'waiting'
          })
        }

        for (var remoteid in remotes)
          query(remoteid)
      }

      wL.waitFor = function (hash, cb) {
        if(wL.byId[hash]) {
          wL.byId[hash].waiting.push(cb)
        }
      }

      // notifies that the blob was got and removes from the wantlist
      wL.got = function (hash) {
        sbot.emit('blobs:got', hash)
        sbot.emit('log:info', ['blobs', null, 'got', hash])
        each(remotes, function (rpc) {
          notify(hash)
        })

        if(!wL.byId[hash]) return

        var cbs = wL.byId[hash].waiting

        // stop tracking
        delete wL.byId[hash]
        var i = +firstKey(wL.jobs, function (e) { return e.id == hash })
        wL.jobs.splice(i, 1)

        cbs.forEach(function (cb) {
          if (isFunction(cb))
            cb()
        })
      }

      // tracks the given peer as a location for the hash
      wL.setFoundAt = function (hash, peerid) {
        wL.byId[hash].has = wL.byId[hash].has || {}
        wL.byId[hash].has[peerid] = true
        if(wL.byId[hash].state === 'waiting')
          wL.byId[hash].state = 'ready'
      }

      wL.isFoundAt = function (hash, peerid) {
        return wL.byId[hash].has && wL.byId[hash].has[peerid]
      }

      return wL
    })()

    // monitor the feed for new links to blobs
    pull(
      sbot.ssb.externalsLinkedFromFeed({live: true}),
      pull.drain(function (data) {
        var hash = data.dest
        if(isHash(hash))
          // do we have the referenced blob yet?
          blobs.has(hash, function (_, has) {
            if(!has) wantList.queue(hash) // no, search for it
          })
      })
    )

    // query worker

    sbot.on('rpc:connect', function (rpc) {
      var id = rpc.id
      remotes[id] = rpc
      //forget any blobs that they did not have
      //in previous requests. they might have them by now.
      wantList.each(function (e, k) {
        if(e.has && e.has[id] === false) delete e.has[id]
      })
      var done = rpc.task()
      query(id, done)
      rpc.once('closed', function () {
        delete remotes[id]
      })

      //when the peer gets a blob, if its one we want,
      //then request it.
      pull(
        rpc.blobs.changes({}),
        pull.drain(function (hash) {
          if (wantList.wants(hash)) {
            wantList.setFoundAt(hash, id)
            download()
          }
        }, function (err) {
          //Ignore errors.
          //these will either be from a cli client that doesn't have
          //blobs plugin, or because stream has terminated.
        })
      )
    })

    var queries = {}
    function query (remoteid, done) {
      done = done || function (){}

      var remote = remotes[remoteid]
      if (!remote)
        return done()
      if (queries[remoteid])
        return done()

      // filter bloblist down to blobs not (yet) found at the peer
      var neededBlobs = wantList.subset('waiting')
        .map(function (e) { return e.id })
        .filter(function (blobhash) {
          return !wantList.isFoundAt(blobhash, remoteid)
        })
      if(!neededBlobs.length)
        return done()

      // does the remote have any of them?
      queries[remoteid] = true
      remote.blobs.has(neededBlobs, function (err, hasList) {
        if(err) console.error(err.stack)
        delete queries[remoteid]
        if(hasList) {
          var downloadDone = multicb()
          neededBlobs.forEach(function (blobhash, i) {
            if (!wantList.wants(blobhash))
              return // must have been got already

            if (hasList[i]) {
              wantList.setFoundAt(blobhash, remoteid)
              wantList.waitFor(blobhash, downloadDone())
              sbot.emit('log:info', ['blobs', remoteid, 'found', blobhash])
              download()
            }
          })
          downloadDone(done)
        }
      })
    }

    var download = oneTrack(/*config.timeout*/300, 5, 'download', function (done) {
      // get ready blobs with a connected remote
      var readyBlobs = wantList.subset('ready')
        .filter(function (e) {
          return first(e.has, function (has, k) {
            return has && remotes[k]
          })
        })
      if(!readyBlobs.length) return done(true)

      // get the first ready blob and the id of an available remote that has it
      var f = readyBlobs.shift()
      var id = firstKey(f.has, function (_, id) { return !!remotes[id] })
      if (!id)
        return done(true)

      // download!
      f.state = 'downloading'
      sbot.emit('log:info', ['blobs', id, 'downloading', f.id])
      pull(
        remotes[id].blobs.get(f.id),
   //     toBuffer(),
        //TODO: error if the object is longer than we expected.
        blobs.add(f.id, function (err, hash) {
          if(err) {
            f.state = 'ready'
            console.error(err.stack)
          }
          else wantList.got(hash)
          done()
        })
      )
    })

    sbot.on('close', download.abort)

    return {
      get: function (hash) {
        return blobs.get(hash)
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
     //     toBuffer(),
          blobs.add(function (err, hash) {
            if(err) console.error(err.stack)
            else wantList.got(hash)
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
          wantList.queue(hash, cb)
        })
      },

      changes: function () {
        return notify.listen()
      },

      // get current want list
      wants: function () {
        return wantList.jobs
      }
    }
  }
}
