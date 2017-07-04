var pull = require('pull-stream')
var pullNext = require('pull-next')
var para = require('pull-paramap')
var Notify = require('pull-notify')
var Cat = require('pull-cat')
var Debounce = require('observ-debounce')
var deepEqual = require('deep-equal')
var Obv = require('obv')
var isFeed = require('ssb-ref').isFeed
var Pushable = require('pull-pushable')
var detectSync = require('../../lib/detect-sync')

// compatibility function for old implementations of `latestSequence`
function toSeq (s) {
  return 'number' === typeof s ? s : s.sequence
}

function last (a) { return a[a.length - 1] }

// if one of these shows up in a replication stream, the stream is dead
var streamErrors = {
  'unexpected end of parent stream': true, // stream closed okay
  'unexpected hangup': true, // stream closed probably okay
  'read EHOSTUNREACH': true,
  'read ECONNRESET': true,
  'read ENETDOWN': true,
  'read ETIMEDOUT': true,
  'write ECONNRESET': true,
  'write EPIPE': true,
  'stream is closed': true, // rpc method called after stream ended
}

module.exports = function (sbot, notify, config) {
  var debounce = Debounce(200)
  var listeners = {}
  var newPeers = Notify()

  var start = null
  var count = 0
  var rate = 0
  var toSend = {}
  var peerHas = {}
  var pendingFeedsForPeer = {}
  var lastProgress = null

  var replicate = {}

  function request (id, unfollow) {
    if(unfollow === false) {
      if(replicate[id]) {
        delete replicate[id]
        newPeers({id:id, sequence: -1})
      }
    }
    else if(!replicate[id]) {
      replicate[id] = true
      newPeers({id:id, sequence: toSend[id] || 0})
    }
  }

  sbot.getVectorClock(function (err, clock) {
    if(err) throw err
    toSend = clock
  })

  sbot.post(function (msg) {
    //this should be part of ssb.getVectorClock
    toSend[msg.value.author] = msg.value.sequence
    debounce.set()
  })

  debounce(function () {
    // only list loaded feeds once we know about all of them!
    var feeds = Object.keys(toSend).length
    var legacyProgress = 0
    var legacyTotal = 0

    var pendingFeeds = new Set()
    var pendingPeers = {}
    var legacyToRecv = {}

    Object.keys(pendingFeedsForPeer).forEach(function (peerId) {
      if (pendingFeedsForPeer[peerId]) {
        Object.keys(toSend).forEach(function (feedId) {
          if (peerHas[peerId] && peerHas[peerId][feedId]) {
            if (peerHas[peerId][feedId] > toSend[feedId]) {
              pendingFeeds.add(feedId)
            }
          }
        })
        if (pendingFeedsForPeer[peerId].size) {
          pendingPeers[peerId] = pendingFeedsForPeer[peerId].size
        }
      }
    })

    for (var k in toSend) {
      legacyProgress += toSend[k]
    }

    for (var id in peerHas) {
      for (var k in peerHas[id]) {
        legacyToRecv[k] = Math.max(peerHas[id][k], legacyToRecv[k] || 0)
      }
    }

    for (var k in legacyToRecv) {
      if (toSend[k] !== null) {
        legacyTotal += legacyToRecv[k]
      }
    }

    var progress = {
      id: sbot.id,
      rate, // rate of messages written to sbot
      feeds, // total number of feeds we want to replicate
      pendingPeers, // number of pending feeds per peer
      incompleteFeeds: pendingFeeds.size, // number of feeds with pending messages to download

      // LEGACY: Preserving old api. Needed for test/random.js to pass
      progress: legacyProgress,
      total: legacyTotal
    }

    if (!deepEqual(progress, lastProgress)) {
      lastProgress = progress
      notify(progress)
    }
  })

  pull(
    sbot.createLogStream({old: false, live: true, sync: false, keys: false}),
    pull.drain(function (e) {
      //track writes per second, mainly used for developing initial sync.
      if(!start) start = Date.now()
      var time = (Date.now() - start)/1000
      if(time >= 1) {
        rate = count / time
        start = Date.now()
        count = 0
      }
      var pushable = listeners[e.author]

      if(pushable && pushable.sequence == e.sequence) {
        pushable.sequence ++
        pushable.forEach(function (p) {
          p.push(e)
        })
      }
      count ++
    })
  )

  var chs = sbot.createHistoryStream

  sbot.createHistoryStream.hook(function (fn, args) {
    var upto = args[0] || {}
    var seq = upto.sequence || upto.seq
    if(this._emit) this._emit('call:createHistoryStream', args[0])

    //if we are calling this locally, skip cleverness
    if(this===sbot) return fn.call(this, upto)

    // keep track of each requested value, per feed / per peer.
    peerHas[this.id] = peerHas[this.id] || {}
    peerHas[this.id][upto.id] = seq - 1 // peer requests +1 from actual last seq

    debounce.set()

    //handle creating lots of history streams efficiently.
    //maybe this could be optimized in map-filter-reduce queries instead?
    if(toSend[upto.id] == null || (seq > toSend[upto.id])) {
      upto.old = false
      if(!upto.live) return pull.empty()
      var pushable = listeners[upto.id] = listeners[upto.id] || []
      var p = Pushable(function () {
        var i = pushable.indexOf(p)
        pushable.splice(i, 1)
      })
      pushable.push(p)
      pushable.sequence = seq
      return p
    }
    return fn.call(this, upto)
  })

  // collect the IDs of feeds we want to request
  var opts = config.replication || {}
  opts.hops = opts.hops || 3
  opts.dunbar = opts.dunbar || 150
  opts.live = true
  opts.meta = true

  //XXX policy about replicating specific peers should be outside
  //of this plugin.
  function localPeers () {
    if(!sbot.gossip) return
    sbot.gossip.peers().forEach(function (e) {
      if (e.source === 'local' && toSend[e.key] == null)
        request(e.key)
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
  //XXX ^

  function upto (opts) {
    opts = opts || {}
    var ary = Object.keys(replicate).map(function (k) {
      return { id: k, sequence: toSend[k]||0 }
    })
    if(opts.live)
      return Cat([
        pull.values(ary),
        pull.once({sync: true}),
        newPeers.listen()
      ])

    return pull.values(ary)
  }

  sbot.on('rpc:connect', function(rpc) {
    // this is the cli client, just ignore.
    if(rpc.id === sbot.id) return
    if (!sbot.ready()) return

    var errorsSeen = {}
    //check for local peers, or manual connections.
    localPeers()

    var drain

    function replicate(upto, cb) {
      pendingFeedsForPeer[rpc.id] = pendingFeedsForPeer[rpc.id] || new Set()
      pendingFeedsForPeer[rpc.id].add(upto.id)

      debounce.set()

      pull(
        rpc.createHistoryStream({
          id: upto.id,
          seq: (upto.sequence || upto.seq || 0) + 1,
          live: true,
          keys: false
        }),

        pull.through(detectSync(rpc.id, upto, toSend, peerHas, function () {
          if (pendingFeedsForPeer[rpc.id]) {
            // this peer has finished syncing, remove from progress
            pendingFeedsForPeer[rpc.id].delete(upto.id)
            debounce.set()
          }
        })),

        sbot.createWriteStream(function (err) {
          if(err && !(err.message in errorsSeen)) {
            errorsSeen[err.message] = true
            if(err.message in streamErrors) {
              cb && cb(err)
              if(err.message === 'unexpected end of parent stream') {
                if (err instanceof Error) {
                  // stream closed okay locally
                } else {
                  // pre-emptively destroy the stream, assuming the other
                  // end is packet-stream 2.0.0 sending end messages.
                  rpc.close(err)
                }
              }
            } else {
              console.error(
                'Error replicating with ' + rpc.id + ':\n  ',
                err.stack
              )
            }
          }

          // if stream closes, remove from pending progress
          if (pendingFeedsForPeer[rpc.id]) {
            pendingFeedsForPeer[rpc.id].delete(upto.id)
            debounce.set()
          }
        })
      )
    }

    var replicate_self = false
    //if replicate.fallback is enabled
    //then wait for the fallback event before
    //starting to replicate by this strategy.
    if(config.replicate && config.replicate.fallback)
      rpc.once('fallback:replicate', fallback)
    else
      fallback()

    function fallback () {
      //if we are not configured to use EBT, then fallback to createHistoryStream
      if(replicate_self) return
      replicated_self = true
      replicate({id: sbot.id, sequence: toSend[sbot.id] || 0})
    }

    //trigger this if ebt.replicate fails...
    rpc.once('call:createHistoryStream', next)

    var started = false
    function next () {
      if(started) return
      started = true
      sbot.emit('replicate:start', rpc)

      rpc.on('closed', function () {
        sbot.emit('replicate:finish', toSend)

        // if we disconnect from a peer, remove it from sync progress
        delete pendingFeedsForPeer[rpc.id]
        debounce.set()
      })

      //make sure we wait until the clock is loaded
      pull(
        upto({live: opts.live}),
        drain = pull.drain(function (upto) {
          if(upto.sync) return
          if(!isFeed(upto.id)) throw new Error('expected feed!')
          if(!Number.isInteger(upto.sequence)) throw new Error('expected sequence!')

          if(upto.id == sbot.id && replicate_self) return replicate_self = true
          replicate(upto, function (err) {
            drain.abort()
          })
        }, function (err) {
          if(err && err !== true)
            sbot.emit('log:error', ['replication', rpc.id, 'error', err])
        })
      )

    }
  })

  return {
    request: request,
    upto: upto,
    changes: notify.listen
  }
}

