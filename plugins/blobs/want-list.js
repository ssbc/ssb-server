
function isFunction (f) {
  return 'function' === typeof f
}

function each (obj, iter) {
  for(var k in obj)
    iter(obj[k], k, obj)
}

function firstKey(obj, iter) {
  iter = iter || id
  for(var k in obj)
    if(iter(obj[k], k, obj))
      return k
}

module.exports = function (sbot, notify) {
  function BlobState (hash) {
    return {
      id: hash,
      has: {},
      waiting: [], // cb queue
      requests: 0, // # of times want()ed
      notfounds: 0, // # of times failed to find at a peer
      state: 'waiting'
    }
  }
  var wL = {
    byId: {}, // [hash] => {blob state}
    jobs: [] // ordered queue of {blob state}
  }

  // provides a random subset of the current state
  // - `filter` function
  // - `n` number (default 20) max subset length
  wL.filter = function (filter, n) {
    return wL.jobs
      .filter(filter)
      .sort(function (a, b) {
        return (
          clamp(a.requests - a.notfounds, -20, 20)
        - clamp(b.requests - b.notfounds, -20, 20)
        + (Math.random()*5 - 2.5)
        )
      })
  }

  wL.each = function (iter) {
    return each(wL.byId, iter)
  }

  wL.wants = function (hash) {
    return (hash in wL.byId)
  }

  // adds a blob to the want list
  wL.queue = function (hash, cb) {
    if (!wL.byId[hash]) {
      wL.jobs.push(wL.byId[hash] = BlobState(hash))
      //check if a peer has something.
    }
    wL.onQueue && wL.onQueue(hash)
    if (cb) wL.byId[hash].waiting.push(cb)
  }

  // queues a callback for when a particular blob arrives
  wL.waitFor = function (hash, cb) {
    if(wL.byId[hash]) wL.byId[hash].waiting.push(cb)
  }

  // notifies that the blob was got and removes it from the wantlist
  wL.got = function (hash) {
    sbot.emit('blobs:got', hash)
    notify(hash)

    if(!wL.byId[hash]) return

    var cbs = wL.byId[hash].waiting

    // stop tracking
    delete wL.byId[hash]
    var i = +firstKey(wL.jobs, function (e) { return e.id == hash })
    wL.jobs.splice(i, 1) //remove from jobs queue.

    // notify queued cbs
    cbs.forEach(function (cb) {
      if (isFunction(cb)) cb(null, true)
    })
  }

  // tracks the given peer as a location for the hash
  wL.setFoundAt = function (hash, peerid) {
    if(!wL.byId[hash]) return false
    wL.byId[hash].has[peerid] = true
    if(wL.byId[hash].state === 'waiting')
      wL.byId[hash].state = 'ready'
    return true
  }

  wL.isFoundAt = function (hash, peerid) {
    return wL.byId[hash].has[peerid]
  }

  return wL
}
