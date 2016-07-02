var pull = require('pull-stream')
var para = require('pull-paramap')
var Notify = require('pull-notify')
var many = require('pull-many')
var cat = require('pull-cat')
var Abort = require('pull-abortable')
var Debounce = require('observ-debounce')
var Observ = require('observ')
var mdm = require('mdmanifest')
var apidoc = require('../lib/apidocs').replicate

var DAY = 1000*60*60*24
var LIMIT = [-1, -1, 100] // default rate-limits, by hops out

var notify = Notify()

function last (a) { return a[a.length - 1] }

// main log-replication behavior
function replicate(sbot, config, rpc, cb) {

  // rate limiter:
  // calculate how many messages we're willing to receive for a user
  // - works by number of "hops" away from the local user, in the follow graph
  function calcLimit (upto) {

    var limit = config.replication && config.replication.limit
    if(!Array.isArray(limit)) limit = LIMIT

    var hopLimit = (upto.hops < limit.length) ? limit[upto.hops] : last(limit)
    if(hopLimit <=0) return hopLimit

    return (
        !upto.ts
      ? hopLimit
      : Math.ceil((Date.now() - upto.ts)/DAY * hopLimit)
    )
  }

  // TODO
  // is `initial` and `to_recv` the same thing? do we need both?
  // -prf
  var aborter = Abort()
  var sources = many()
  var to_send = {} // { feedId => their latest seq } map for feeds requested by the peer
  var to_recv = {} // { feedId => our latest seq } map for feeds we request
  var initial = {} // { feedId => initial seq } map for feeds request, remembers what seq each feed was initially at
  var replicated = {} // { feedId => final seq } map for feeds request, tracks the final seq for each received feed
  var debounce = Debounce(100)

  // track progress, and emit update events periodically
  debounce(function () {
    // HACK
    // This uses the information produced by normal replication 
    // to get a rough approximation for a progress-bar.
    // When the peer requests feeds, they'll tell us what sequence they have for each feed.
    // We track that in `to_send`.
    // We also track the sequence we have, for the feeds we're requesting, in `to_recv`.
    // If it so happens they have a higher sequence for a feed than we do, then
    // `to_send` will be higher than `to_recv`.
    // This means they have to request a feed for us to track that feed's progress, which is
    // often the case, but not always.
    // Works for now.
    // -prf (but code by dominic, blame him)
    var total = 0, progress = 0, feeds = 0
    for(var id in to_recv) {
      var feed_to_send    = to_send[id]    || 0
      var feed_to_recv    = to_recv[id]    || 0
      var feed_replicated = replicated[id] || 0
      if(to_send[id] != null && to_recv[id] != null) {
        feeds++
        if(feed_to_send > feed_to_recv) {
          total    += (feed_to_send    - feed_to_recv)
          progress += (feed_replicated - feed_to_recv)
        }
      }
    }

    // emit progress event
    notify({
      type: 'progress',
      peerid: rpc.id,
      total: total,
      progress: progress,
      feeds: feeds,
      sync: !!(feeds && (progress >= total))
    })
  })

  rpc.on('call:createHistoryStream', function (opts) {
    // track what sequence the peer has for each feed
    to_send[opts.id] = (opts.sequence || opts.seq) - 1
    debounce.set()
  })

  // compatibility function for old implementations of `latestSequence`
  function toSeq (s) {
    return 'number' === typeof s ? s : s.sequence
  }

  // collect the IDs of feeds we want to request
  var opts = config.replication || {}
  opts.hops = opts.hops || 3
  opts.dunbar = opts.dunbar || 150
  opts.live = true
  opts.meta = true
  var userSources = [sbot.friends.createFriendStream(opts)]
  if (sbot.gossip) {
    // if we have the gossip plugin active, then include new local peers
    // so that you can put a name to someone on your local network.
    userSources.unshift(pull.values(
      sbot.gossip.peers()
        .filter(function (e) { return e.source === 'local' })
        .map(function (e) { return {id: e.key, hops: 6} })
    ))
  }

  // create read-streams for the desired feeds
  pull(
    cat(userSources),
    aborter,
    // filter out duplicates, and also keep track of what we expect to receive
    pull.filter(function (s) {
      var id = 'string' === typeof s ? s  : s.id
      if(to_recv[id] == null) { to_recv[id] = 0; return true }
    }),
    // lookup the latest sequence from each user
    para(function (data, cb) {
      if(data.sync) return cb(null, data)
      var id = data.id || data
      sbot.latestSequence(id, function (err, seq) {
        cb(null, {
          id: id,
          sequence: err ? 0 : toSeq(seq),
          ts: err ? null : seq.ts,
          hops: data.hops
        })
      })
    }, 32),
    pull.drain(function (upto) {
      to_recv[upto.id] = upto.sequence
      initial[upto.id] = replicated[upto.id] = upto.sequence

      var limit = config.party ? null : calcLimit(upto)

      sources.add(
        pull(

          // TODO
          // how do `limit` and `live` interact, here?
          // what if only the first 100 messages, of 200, were requested? 
          // would you start getting live updates, starting at sequence 201?
          // -prf
          rpc.createHistoryStream({
            id: upto.id,
            seq: upto.sequence + 1,
            limit: limit,
            live: true,
            keys: false
          }),
          pull.through(function () {
            if(limit === null || limit--) return
            //REPLICATIOAN BACK PRESSURE
            rpc.close(true)

            // TODO
            // do we want to close the entire RPC connection when the limit is hit?
            // the limit is per feed ... it should just close the feed's history stream
            // -prf
          })
        )
      )

      debounce.set()
    }, function (err) {
      if(err)
        sbot.emit('log:error', ['replication', rep.id, 'error', err])
      sources.cap()
    })
  )

  // create the read -> write stream
  pull(
    sources,
    pull.through(function (msg) {
      // track progress
      replicated[msg.author] = Math.max(
        replicated[msg.author]||0,
        msg.sequence
      )
      debounce.set()
    }),
    sbot.createWriteStream(function (err) {
      aborter.abort()
      debounce.immediate()

      // done!
      cb(err, replicated, initial)
    })
  )
}

module.exports = {
  name: 'replicate',
  version: '1.0.0',
  manifest: mdm.manifest(apidoc),
  replicate: replicate,
  init: function (sbot, config) {
    sbot.createHistoryStream.hook(function (fn, args) {
      if(this._emit)
        this._emit('call:createHistoryStream', args[0])
      return fn.apply(this, args)
    })

    // watch for new connections and replicate on creation
    sbot.on('rpc:connect', function(rpc) {
      // this is the cli client, just ignore.
      if(rpc.id === sbot.id) return

      var startTS = Date.now()
      sbot.emit('log:info', ['replicate', rpc.id, 'start'])
      sbot.emit('replicate:start', rpc)
      replicate(sbot, config, rpc, function (err, final, initial) {
        if(err) {
          sbot.emit('replicate:fail', err)
          sbot.emit('log:warning', ['replicate', rpc.id, 'error', err])
        } else {
          var progress = {}
          // subtract `initial` from `final` so `progress` represents a delta
          for (var author in final)
            progress[author] = final[author] - (initial[author] || 0)

          var progressSummary = summarizeProgress(progress, Date.now() - startTS)
          if (progressSummary)
            sbot.emit('log:notice', ['replicate', rpc.id, 'success', progressSummary])
          sbot.emit('replicate:finish', final)
        }
      })
    })

    return {
      changes: function () {
        return notify.listen()
      }
    }
  }
}

function summarizeProgress (progress, timeDelta) {
  // count the number of feeds updated, and the number of new messages
  var updatedFeeds = 0, newMessages = 0
  for (var author in progress) {
    if (progress[author] > 0) {
      updatedFeeds++
      newMessages += progress[author]
    }
  }
  // no message if no updates
  if (updatedFeeds === 0)
    return false

  // create a nicely-formatted time
  var timeDeltaMM = Math.floor(timeDelta / (1e3*60))
  var timeDeltaSS = Math.floor((timeDelta % (1e3*60)) / 1e3)
  var timeDeltaNice = ''+timeDeltaMM+'m'+timeDeltaSS+'s'

  return 'Feeds updated: '+updatedFeeds+', New messages: '+newMessages+', in '+timeDeltaNice
}






