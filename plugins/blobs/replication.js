var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var isBlob = require('ssb-ref').isBlobId
var multicb = require('multicb')
var Queue = require('./queue')

//TODO: rewrite to use queues for each job.
//decouple control flow from data structures.

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

//function clamp (n, lo, hi) {
//  return Math.min(Math.max(n, lo), hi)
//}
//
//function desigil (hash) {
//  return isBlob(hash) ? hash.substring(1) : hash
//}
//
//function resigil (hash) {
//  return isBlob(hash) ? hash : '&' + hash
//}
//
module.exports = function (sbot, opts, notify) {

  var jobs = {}

  var hasQueue = Queue(function (hasQueue, done) {
    //check if there is a something in the has queue.
    //filter out cases where work is impossible...
    //(empty queue, or no peers)
    if(Object.keys(sbot.peers).length === 0) return done()

    var job = hasQueue.pull()
    if(!job) throw new Error('hasQueue returned null, length: '+l)
    if(job.done) return done()

    var n = 0, found = false
    each(sbot.peers, function (peers, peerId) {
      if(('undefined' !== typeof job.has[peerId]) || !peers[0]) return
      n++
      peers[0].blobs.has(job.id, function (err, has) {
        found = found || (job.has[peerId] = has)
        if(--n) return
        next()
      })
    })
    if(!n) return hasQueue.push(job), done()

    function next () {
      (found ? getQueue : hasQueue).push(job)
      done()
    }
  })
  var getQueue = Queue(function (getQueue, done) {
    if(getQueue.length() === 0) return done()
    if(!Object.keys(sbot.peers).length) return done()
    var job = getQueue.pull(), remote

    //this covers weird edgecase where a blob is added
    //while something is looking for it. covered in
    //test/blobs2.js
    if(job.done) {
      delete jobs[job.id]
      return done()
    }

    var peerId
    for(var k in job.has) {
      if(job.has[k]) { peerId = k; break;}
    }

    if(!peerId) {
      hasQueue.push(job); return done()
    }

    remote = peer(peerId)
    if(!remote) {
      job.has.slice(i, 1)
      if(job.has.length) getQueue.push(job)
      else               hasQueue.push(job)
      return
    }

    pull(
      remote.blobs.get(job.id),
      sbot.blobs.add(job.id, function (err) {
        if(!err) {
          console.log(job)
          job.cbs.forEach(function (cb) { if(cb) cb() })
          return done() //success
        }
        //if we didn't get the blob, put it back on the get or has queue.
        job.has.splice(i, 1)
        if(job.has.length) getQueue.push(job)
        else hasQueue.push(job)
        done()
      })
    )
  })
  var hasMap = {}

  function createJob(id, type, cb) {
    if(jobs[id]) jobs[id].cbs.push(cb)
    else hasQueue.push(jobs[id] = {id: id, type: type, has: {}, cbs: cb ? [cb] : [], done: false})
  }

  function peer(id) {
    return sbot.peers[id] && sbot.peers[id][0]
  }

  // monitor the feed for new links to blobs
  pull(
    sbot.links({dest: '&', live: true}),
    pull.drain(function (data) {
      var hash = data.dest
      // do we have the referenced blob yet?
      if(isBlob(hash)) sbot.blobs.has(hash, function (_, has) {
        console.log('createJob', hash)
        if(!has) createJob(hash, 'feed')
      })
    })
  )

  //handle weird edge case where something is added locally
  //but we are already looking for it because we saw a link.
  sbot.on('blobs:got', function (hash) {
    if(jobs[hash]) jobs[hash].done = true
  })

  sbot.on('rpc:connect', function (rpc) {
    for(id in jobs) {
      if(false === jobs[id].has[rpc.id]) {
        console.log('CLEAR', id, rpc.id)
        delete jobs[id].has[rpc.id]
        console.log(jobs[id], getQueue.length(), hasQueue.length())
      }
    }
  })

  return {
    has: hasQueue,
    get: getQueue,
    want: function (id, cb) {
      createJob(id, 'want', cb)
    }
  }
}

