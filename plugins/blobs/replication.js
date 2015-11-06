var pull = require('pull-stream')
var Queue = require('./queue')

function each (obj, iter) {
  for(var k in obj)
    iter(obj[k], k, obj)
}

function first (obj, test) {
  var v
  for (var k in obj)
    if(v = test(obj[k], k, obj))
      return v
}

module.exports = function (sbot, opts, notify) {
  var jobs = {}, hasQueue, getQueue

  // calculate quotas for each feed.
  // start with size of each blob
  // divided between the feeds that mention it.
  // getting a use for each feed.

  // periodically recalculate the quotas.
  // or adjust it when someone links or you download a file?

  function createJob(id, cb) {
    if(jobs[id]) return jobs[id].cbs.push(cb)
    hasQueue.push(jobs[id] = {
      id: id, has: {}, cbs: cb ? [cb] : [], done: false
    })
  }

  function hasPeers () {
    return Object.keys(sbot.peers).length !== 0
  }

  hasQueue = Queue(function (_, done) {
    //check if there is a something in the has queue.
    //filter out cases where work is impossible...
    //(empty queue, or no peers)
    if(!hasPeers()) return done()

    var job = hasQueue.pull()
    if(job.done) return done()

    var n = 0, found = false
    each(sbot.peers, function (peers, id) {
      if(('undefined' !== typeof job.has[id]) || !peers[0]) return
      n++
      peers[0].blobs.has(job.id, function (err, has) {
        found = found || (job.has[id] = has)
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
  getQueue = Queue(function (_, done) {
    if(!hasPeers()) return done()

    var job = getQueue.pull()

    //this covers weird edgecase where a blob is added
    //while something is looking for it. covered in
    //test/blobs2.js
    if(job.done) {
      delete jobs[job.id]
      return done()
    }

    var remote = first(job.has, function (has, id) {
      return has && peer(id)
    })

    if(!remote) {
      hasQueue.push(job); return done()
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

  function peer(id) {
    return sbot.peers[id] && sbot.peers[id][0]
  }

  // monitor the feed for new links to blobs
  pull(
    sbot.links({dest: '&', live: true}),
    pull.drain(function (data) {
      // do we have the referenced blob yet?
      sbot.blobs.has(data.dest, function (_, has) {
        if(!has) createJob(data.dest)
      })
    })
  )

  //handle weird edge case where something is added locally
  //but we are already looking for it because we saw a link.
  sbot.on('blobs:got', function (hash) {
    if(jobs[hash]) jobs[hash].done = true
  })

  sbot.on('rpc:connect', function (rpc) {
    for(id in jobs)
      if(false === jobs[id].has[rpc.id])
        delete jobs[id].has[rpc.id]
  })

  return {
    has: hasQueue,
    get: getQueue,
    want: function (id, cb) {
      createJob(id, cb)
    }
  }
}

