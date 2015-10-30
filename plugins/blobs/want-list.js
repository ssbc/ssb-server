
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

module.exports = function (sbot, notify, query) {
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
    var isNew = false
    if (!wL.byId[hash]) {
      isNew = true
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

    if (isNew) {
      // trigger a query round with the existing connections
      each(sbot.peers, function (_, id) { query(id) })
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
    notify(hash)

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
}
