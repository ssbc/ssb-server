var pull = require('pull-stream')
var para = require('pull-paramap')
var Notify = require('pull-notify')
var many = require('pull-many')
var Cat = require('pull-cat')
var Abort = require('pull-abortable')
var Debounce = require('observ-debounce')
var Observ = require('observ')
var mdm = require('mdmanifest')
var apidoc = require('../lib/apidocs').replicate

var ssbClient = require('ssb-client')

var DAY = 1000*60*60*24
var LIMIT = [-1, -1, 100] // default rate-limits, by hops out

var notify = Notify()

// compatibility function for old implementations of `latestSequence`
function toSeq (s) {
  return 'number' === typeof s ? s : s.sequence
}


function last (a) { return a[a.length - 1] }

// main log-replication behavior
//function replicate(sbot, config, rpc, cb) {
//
//  // TODO
//  // is `initial` and `to_recv` the same thing? do we need both?
//  // -prf
//  var aborter = Abort()
//  var sources = many()
//  var to_send = {} // { feedId => their latest seq } map for feeds requested by the peer
//  var to_recv = {} // { feedId => our latest seq } map for feeds we request
//  var initial = {} // { feedId => initial seq } map for feeds request, remembers what seq each feed was initially at
//  var replicated = {} // { feedId => final seq } map for feeds request, tracks the final seq for each received feed
//  var debounce = Debounce(100)
//
//  // track progress, and emit update events periodically
//  debounce(function () {
//    // HACK
//    // This uses the information produced by normal replication 
//    // to get a rough approximation for a progress-bar.
//    // When the peer requests feeds, they'll tell us what sequence they have for each feed.
//    // We track that in `to_send`.
//    // We also track the sequence we have, for the feeds we're requesting, in `to_recv`.
//    // If it so happens they have a higher sequence for a feed than we do, then
//    // `to_send` will be higher than `to_recv`.
//    // This means they have to request a feed for us to track that feed's progress, which is
//    // often the case, but not always.
//    // Works for now.
//    // -prf (but code by dominic, blame him)
//    var total = 0, progress = 0, feeds = 0
//    for(var id in to_recv) {
//      var feed_to_send    = to_send[id]    || 0
//      var feed_to_recv    = to_recv[id]    || 0
//      var feed_replicated = replicated[id] || 0
//      if(to_send[id] != null && to_recv[id] != null) {
//        feeds++
//        if(feed_to_send > feed_to_recv) {
//          total    += (feed_to_send    - feed_to_recv)
//          progress += (feed_replicated - feed_to_recv)
//        }
//      }
//    }
//
//    // emit progress event
//    notify({
//      type: 'progress',
//      peerid: rpc.id,
//      total: total,
//      progress: progress,
//      feeds: feeds,
//      sync: !!(feeds && (progress >= total))
//    })
//  })
//
//}
//
module.exports = {
  name: 'replicate',
  version: '1.0.0',
  manifest: mdm.manifest(apidoc),
  //replicate: replicate,
  init: function (sbot, config) {

    var newPeer = Notify()

    var to_send = {}
    var to_recv = {}

    //keep track of maximum requested value, per feed.
    sbot.createHistoryStream.hook(function (fn, args) {
      var upto = args[0] || {}
      to_recv[upto.id] = Math.max(to_recv[upto.id] || 0, (upto.sequence || upto.seq) - 1)
      if(this._emit) this._emit('call:createHistoryStream', args[0])

      //compare request to in memory table, to avoid hitting the disk if possible.
      if(!to_send[upto.id])
        return pull.error(new Error('not known'))
      //optimization: if we already know are already uptodate, do not actually hit the disk.
      else if(to_send[upto.id] < upto.sequence)
        return sbot.createHistoryStream({old: false, id: upto.id, sequence: upto.sequence})
      else
        return fn.apply(this, args)
    })

    var start, count = 0

    pull(
      sbot.createLogStream({old: false, live: true, sync: false, keys: false}),
      pull.drain(function (e) {
        //track writes per second, mainly used for developing initial sync.
        if(!start) start = Date.now()
        var time = (Date.now() - start)/1000
        if(time >= 1) {
          start = Date.now()
          console.error(count / time)
          count = 0
        }
        count ++

        addPeer({id: e.author, sequence: e.sequence})
      })
    )

    // collect the IDs of feeds we want to request
    var opts = config.replication || {}
    opts.hops = opts.hops || 3
    opts.dunbar = opts.dunbar || 150
    opts.live = true
    opts.meta = true

    function localPeers () {
      if(!sbot.gossip) return
      sbot.gossip.peers()
        .forEach(function (e) {
          if(to_send[e.key] == null)
            addPeer({id: e.key, sequence: 0})
        })
    }

    //also request local peers.
    if (sbot.gossip) {
      // if we have the gossip plugin active, then include new local peers
      // so that you can put a name to someone on your local network.
      var int = setInterval(localPeers, 1000)
      if(int.unref) int.unref()
      localPeers()
    }

    function addPeer (upto) {
      if(!upto.id) return console.log('invalid', upto)
      var isNew = false
  
      if(to_send[upto.id] == null) isNew = true

      to_send[upto.id] = Math.max(to_send[upto.id] || 0, upto.sequence || upto.seq || 0)

      if(isNew) newPeer({id: upto.id, sequence: to_send[upto.id]})
    }

    // create read-streams for the desired feeds
    pull(
      sbot.friends.createFriendStream(opts),
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
            id: id, sequence: err ? 0 : toSeq(seq)
          })
        })
      }, 32),
      pull.drain(addPeer)
    )

    function upto (opts) {
      opts = opts || {}
      var ary = Object.keys(to_send).map(function (k) {
        return { id: k, sequence: to_send[k] }
      })

      if(opts.live)
        return Cat([pull.values(ary), newPeer.listen()])

      return pull.values(ary)
    }

    sbot.on('rpc:connect', function(rpc) {
      if(rpc.id === sbot.id) return
      rpc.on('closed', function () {
        console.log('rerep')
        connected = false
      })
      localPeers()
      // this is the cli client, just ignore.

      var drain

      sbot.emit('log:info', ['replicate', rpc.id, 'start'])
      sbot.emit('replicate:start', rpc)

      pull(
        upto({live: opts.live, sync: false}),
        drain = pull.drain(function (upto) {

          pull(
            rpc.createHistoryStream({
              id: upto.id,
              seq: upto.sequence,// + 1,
              live: true,
              keys: false
            }),
            pull.filter(function (e) {
              //incase we where receiving messages from two peers at once,
              //and we have already seen this one, just skip it.
              if(to_send[e.author] < e.sequence) return true
            }),
            sbot.createWriteStream(function (err) {
              if(err) console.error(err.stack)
              drain.abort()
            })
          )

        }, function (err) {
          if(err)
            sbot.emit('log:error', ['replication', rep.id, 'error', err])
        })
      )


//      replicate(sbot, config, rpc, function (err, final, initial) {
//        if(err) {
//          sbot.emit('replicate:fail', err)
//          sbot.emit('log:warning', ['replicate', rpc.id, 'error', err])
//        } else {
//          var progress = {}
//          // subtract `initial` from `final` so `progress` represents a delta
//          for (var author in final)
//            progress[author] = final[author] - (initial[author] || 0)
//
//          var progressSummary = summarizeProgress(progress)
//          if (progressSummary)
//            sbot.emit('log:notice', ['replicate', rpc.id, 'success', progressSummary])
//          sbot.emit('replicate:finish', final)
//        }
//      })
    })

    return {
      changes: notify.listen,
      upto: upto
    }
  }
}

function summarizeProgress (progress) {
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
  return 'Feeds updated: '+updatedFeeds+', New messages: '+newMessages
}




