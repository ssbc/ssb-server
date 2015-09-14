'use strict'

//                 ms    s    m    h    d
var MONTH_IN_MS = 1000 * 60 * 60 * 24 * 30

var Blobs = require('multiblob')
var path = require('path')
var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var isBlob = require('ssb-ref').isBlobId
var multicb = require('multicb')
var Notify = require('pull-notify')
var mdm = require('mdmanifest')
var apidoc = require('fs').readFileSync(__dirname + '/blobs.md', 'utf-8')

function isFunction (f) {
  return 'function' === typeof f
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

function clamp (n, lo, hi) {
  return Math.min(Math.max(n, lo), hi)
}

function isString (s) {
  return 'string' === typeof s
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

  var timers = []

  function clear (timer) {
    var i = timers.indexOf(timer)
    clearTimeout(timer[i])
    times.splice(i, 1)
  }

  function delay (job, d) {
    var i
    var timer = setTimeout(function () {
      timers.splice(timers.indexOf(timer), 1); job()
    }, d)
    timers.push(timer)
    return timer
  }

  function job () {
    // abort if already doing too many
    if(doing >= n) return
    doing++

    // run the behavior
    fun(function (done) {
      doing--
      if(done) {
        // we're done, dont requeue
        return
      }

      // requeue after a delay
      var wait = ~~(delay/2 + delay*Math.random())
      delay(job, wait)
    })
  }

  job.abort = function () {
    timers.forEach(function (timer) { clearTimeout(timer) })
  }

  return job
}

module.exports = {
  name: 'blobs',
  version: '0.0.0',
  manifest: mdm.manifest(apidoc),
  permissions: {
    anonymous: {allow: ['has', 'get', 'changes']},
  },
  init: function (sbot, opts) {

    var notify = Notify()
    var config = opts
    //NOW PROVIDED BY CORE. REFACTOR THIS AWAY.
    var remotes = {} // connected peers (rpc objects)
    var blobs = sbot._blobs = Blobs({
      dir: path.join(config.path, 'blobs'),
      hash: 'sha256'
    })
    var wantList = (function (){
      var wL = {
        byId: {}, // [hash] => {blob state}
        jobs: [] // ordered queue of {blob state}
      }

      // provides a random subset of the current state
      // - `filter` function
      // - `n` number (default 20) max subset length
      wL.subset = function (filter, n) {
        return wL.jobs
          .filter(filter)
          .sort(sortSubset)
          .slice(0, n || 20)
      }
      function sortSubset (a, b) {
        var apriority = clamp(a.requests - a.notfounds, -20, 20)
        var bpriority = clamp(b.requests - b.notfounds, -20, 20) 
        var randomization = (Math.random()*5 - 2.5)
        return apriority - bpriority + randomization
      }

      wL.each = function (iter) { 
        return each(wL.byId, iter)
      }

      wL.wants = function (hash) {
        return (hash in wL.byId)
      }

      // adds a blob to the want list
      wL.queue = function (hash, cb) {
        var isnew = false
        if (!wL.byId[hash]) {
          isnew = true
          sbot.emit('log:info', ['blobs', null, 'want', hash])
          wL.jobs.push(wL.byId[hash] = {
            id: hash,
            waiting: [], // cb queue
            requests: 0, // # of times want()ed
            notfounds: 0, // # of times failed to find at a peer
            state: 'waiting'
          })
        }

        if (cb)
          wL.byId[hash].waiting.push(cb)

        if (isnew) {
          // trigger a query round with the existing connections
          for (var remoteid in remotes)
            query(remoteid)
        }
      }

      // queues a callback for when a particular blob arrives
      wL.waitFor = function (hash, cb) {
        if(wL.byId[hash]) {
          wL.byId[hash].waiting.push(cb)
        }
      }

      // notifies that the blob was got and removes it from the wantlist
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

        // notify queued cbs
        cbs.forEach(function (cb) {
          if (isFunction(cb))
            cb(null, true)
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
      sbot.links({dest: '&', live: true}),

      pull.drain(function (data) {
        var hash = data.dest
        if(isBlob(hash))
          // do we have the referenced blob yet?
          blobs.has(hash, function (_, has) {
            if(!has) { // no...
              sbot.get(data.source, function (err, msg) {
                // was this blob published in the last month?
                var dT = Math.abs(Date.now() - msg.timestamp)
                if (dT < MONTH_IN_MS)
                  wantList.queue(hash) // yes, search for it
              })
            }
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

      query(id, function (err) {
        if(err) console.error(err.stack)
      })

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
      var neededBlobs = wantList.subset(function (e) {
        return e.state == 'waiting' && !wantList.isFoundAt(e.id, remoteid)
      })
      if(!neededBlobs.length)
        return done()

      // does the remote have any of them?
      queries[remoteid] = true
      var neededBlobIds = neededBlobs.map(function (e) { return e.id })

      remote.blobs.has(neededBlobIds, function (err, hasList) {
        if(err) console.error(err.stack)
        delete queries[remoteid]
        if(hasList) {
          var downloadDone = multicb()
          neededBlobs.forEach(function (blob, i) {
            if (!wantList.wants(blob.id))
              return // must have been got already

            if (hasList[i]) {
              wantList.setFoundAt(blob.id, remoteid)
              wantList.waitFor(blob.id, downloadDone())
              sbot.emit('log:info', ['blobs', remoteid, 'found', blob.id])
              download()
            } else {
              blob.notfounds = clamp(blob.notfounds + 1, 0, 40) // track # of notfounds for prioritization
            }
          })
          downloadDone(done)
        }
      })
    }

    var download = oneTrack(/*config.timeout*/300, 5, 'download', function (done) {
      // get ready blobs with a connected remote
      var readyBlobs = wantList.subset(function (e) {
        return e.state == 'ready' && first(e.has, function (has, k) {
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
        //TODO: error if the object is longer than we expected.
        blobs.add(desigil(f.id), function (err, hash) {
          if(err) {
            f.state = 'ready'
            console.error(err.stack)
          }
          else wantList.got(resigil(hash))
          done()
        })
      )
    })

    sbot.on('close', download.abort)

    function desigil (hash) {
      return isBlob(hash) ? hash.substring(1) : hash
    }

    function resigil (hash) {
      return '&' + hash
    }

    return {
      get: function (hash) {
        return blobs.get(desigil(hash))
      },

      has: function (hash, cb) {
        sbot.emit('blobs:has', hash)
        blobs.has(desigil(hash), cb)
      },

      size: function (hash, cb) {
        sbot.emit('blobs:size', hash)
        blobs.size(desigil(hash), cb)
      },

      add: function (hash, cb) {
        if(isFunction(hash)) cb = hash, hash = null

        return pull(
          blobs.add(function (err, hash) {
            if(err) console.error(err.stack)
            else wantList.got(resigil(hash))
            // sink cbs are not exposed over rpc
            // so this is only available when using this api locally.
            if(cb) cb(err, resigil(hash))
          })
        )
      },

      ls: function () {
        return pull(blobs.ls(), pull.map(resigil))
      },
      // request to retrieve a blob,
      // calls back when that file is available.
      // - `opts.nowait`: call cb immediately if not found (dont register for callback)
      want: function (hash, opts, cb) {
        if (typeof opts == 'function') {
          cb = opts
          opts = null
        }
        var nowait = (opts && opts.nowait)
        if(!isBlob(hash)) return cb(new Error('not a hash:' + hash))

        sbot.emit('blobs:wants', hash)
        blobs.has(desigil(hash), function (_, has) {
          if (has) return cb(null, true)
          
          // update queue
          if (nowait) {
            wantList.queue(hash); cb(null, false)
          } else {
            wantList.queue(hash, cb)
          }

          // track # of requests for prioritization
          wantList.byId[hash].requests = clamp(wantList.byId[hash].requests+1, 0, 20)
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
