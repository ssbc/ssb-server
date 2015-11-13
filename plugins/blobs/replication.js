var pull = require('pull-stream')
var Queue = require('./queue')
//var Quotas = require('./quotas')

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

function union (a, b) {
  if (a.length < b.length) {
    var t = b; b = a; a = t
  }
  b.forEach(function (e) {
    if(!~a.indexOf(e)) a.push(e)
  })
  return a
}

function toArray (s) {
  return ('string' === typeof s) ? [s] : s
}
module.exports = function (sbot, opts, notify, quota) {
  var jobs = {}, hasQueue, getQueue

  // calculate quotas for each feed.
  // start with size of each blob
  // divided between the feeds that mention it.
  // getting a use for each feed.

  function createJob(id, owner, cb) {
    if(jobs[id]) {
      jobs[id].owner = merge(jobs[id].owner, owner)
      jobs[id].cbs.push(cb)
      return
    }
    hasQueue.push(jobs[id] = {
      id: id, has: {}, owner: toArray(owner),
      cbs: cb ? [cb] : [], done: false
    })
  }

  function hasPeers () {
    return Object.keys(sbot.peers).length !== 0
  }

  function filter (job) {
    //return false if this job's owner is over quota.
    return job.owner.every(function (id) {
      //if you follow them, no quota.
      if(sbot.friends.get({source: sbot.id, dest: id}))
        return true

      //else, Hard Code 20mb limit.
      return quota[id] < 20*1024*1024 //20 megabytes

      //UGLY. this is totally rough and ugly and we should
      //think of something more nuanced. followed
      //accounts should get a quota too, and maybe
      //it should depend on other things too.
      //if they are a foaf maybe they get a mid limit.
      //there are lots of things we could do.
    })
  }

  hasQueue = Queue(function (_, done) {
    //check if there is a something in the has queue.
    //filter out cases where work is impossible...
    //(empty queue, or no peers)
    if(!hasPeers()) return done()

    var job = hasQueue.pull(filter)
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

    //check if this file is over quota.
    var job = getQueue.pull(filter)

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
      //only accept blobs that have the correct size.
      sbot.blobs.add(job.id, function (err) {
        if(!err) {
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
        if(!has) createJob(data.dest, data.source)
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
      createJob(id, this && this.id ? this.id : sbot.id, cb)
    }
  }
}

