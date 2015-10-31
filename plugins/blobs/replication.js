
var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var isBlob = require('ssb-ref').isBlobId
var multicb = require('multicb')

function isFunction (f) {
  return 'function' === typeof f
}

function each (obj, iter) {
  for(var k in obj)
    iter(obj[k], k, obj)
}

function id (e) { return e }

function first(obj, iter) {
  iter = iter || id
  for(var k in obj) if(iter(obj[k], k, obj)) return obj[k]
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

function desigil (hash) {
  return isBlob(hash) ? hash.substring(1) : hash
}

function resigil (hash) {
  return isBlob(hash) ? hash : '&' + hash
}
//                 ms    s    m    h    d
var MONTH_IN_MS = 1000 * 60 * 60 * 24 * 30

// returns a function which...
// - only acts if not already acting
// - automatically requeues if the task is not yet done
// - `delay`: ms, amount of time to wait before calling again
// - `n`: number, amount of simultaneous calls allowed
// - `label`: string, name of the task (for logging)
// - `fun`: function(cb(done?)), calls cb(true) when done, cb(false) when needs to requeue

function Work(delay, n, label, fun) {
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

module.exports = function (sbot, opts, notify) {

  function peer(id) {
    return sbot.peers[id] && sbot.peers[id][0]
  }

  var wantList = require('./want-list')(sbot, notify, query)
  wantList.onQueue = function () {
    each(sbot.peers, function (_, id) { query(id) })
  }
  // monitor the feed for new links to blobs
  pull(
    sbot.links({dest: '&', live: true}),
    pull.drain(function (data) {
      var hash = data.dest
      // do we have the referenced blob yet?
      if(isBlob(hash)) sbot.blobs.has(hash, function (_, has) {
        if(!has) sbot.get(data.key, function (err, msg) {
          // was this blob published in the last month?
          var dT = Math.abs(Date.now() - msg.timestamp)
          if (dT < MONTH_IN_MS) {
            wantList.queue(hash) // yes, search for it
          }
        })
      })
    })
  )

  // query worker

  sbot.on('rpc:connect', function (rpc) {
    //forget any blobs that they did not have
    //in previous requests. they might have them by now.
    wantList.each(function (e, k) {
      if(e.has && e.has[rpc.id] === false) delete e.has[rpc.id]
    })

    query(rpc.id, function (err) {
      if(err) console.error(err.stack)
    })

    //when the peer gets a blob, if its one we want,
    //then request it.
    pull(
      rpc.blobs.changes({}),
      pull.drain(function (hash) {
        //if this hash is in our wantlist, download it.
        wantList.setFoundAt(hash, rpc.id) && download()
      }, function (_) {
        //Ignore errors. these will either be from a cli client
        //that doesn't have blobs plugin, or because stream has terminated.
      })
    )
  })

  var queries = {}
  //given a peer, request has, then get for wanted blobs.
  function query (remoteid, done) {
    done = done || function (){}

    var remote = peer(remoteid)
    if (!remote) return done()
    if (queries[remoteid]) return done()

    // select wanted blobs which this peer may have.
    var neededBlobs = wantList.filter(function (e) {
      return e.state == 'waiting' && null == wantList.isFoundAt(e.id, remoteid)
    })

    if(!neededBlobs.length) return done()

    // does the remote have any of them?
    queries[remoteid] = true
    var neededBlobIds = neededBlobs.map(function (e) { return e.id })

    remote.blobs.has(neededBlobIds, function (err, hasList) {
      if(err) console.error(err.stack)
      delete queries[remoteid]
      if(hasList) {
        var downloadDone = multicb() //***
        neededBlobs.forEach(function (blob, i) {
          if (!wantList.wants(blob.id))
            return // must have been got already

          if (hasList[i]) {
            wantList.setFoundAt(blob.id, remoteid)
            //WAIT FOR.
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

  var download = Work(300, 5, 'download', function (done) {
    // get ready blobs with a connected remote
    var readyBlobs = wantList.filter(function (e) {
      return e.state == 'ready' && first(e.has, function (has, k) {
        return has && sbot.peers[k]
      })
    })

    if(!readyBlobs.length) return done(true)

    // get the first ready blob and the id
    // of an available remote that has it
    var f = readyBlobs.shift()
    var id = firstKey(f.has, function (_, id) { return !!sbot.peers[id] })
    if (!id) return done(true)

    f.state = 'downloading'
    sbot.emit('log:info', ['blobs', id, 'downloading', f.id])

    pull(peer(id).blobs.get(f.id), sbot.blobs.add(f.id, done))
  })

  sbot.on('close', download.abort)

  return wantList
}

