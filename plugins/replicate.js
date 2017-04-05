'use strict'
var pull = require('pull-stream')
var pullNext = require('pull-next')
var para = require('pull-paramap')
var Notify = require('pull-notify')
var Cat = require('pull-cat')
var Debounce = require('observ-debounce')
var mdm = require('mdmanifest')
var apidoc = require('../lib/apidocs').replicate
var deepEqual = require('deep-equal')

var Pushable = require('pull-pushable')

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

module.exports = {
  name: 'replicate',
  version: '2.0.0',
  manifest: mdm.manifest(apidoc),
  //replicate: replicate,
  init: function (sbot, config) {
    var debounce = Debounce(200)
    var listeners = {}
    var notify = Notify()
    var newPeer = Notify()

    var start = null
    var count = 0
    var rate = 0
    var loadedFriends = false
    var toSend = {}
    var peerHas = {}
    var pendingFeedsForPeer = {}
    var lastProgress = null

    debounce(function () {
      // only list loaded feeds once we know about all of them!
      var feeds = loadedFriends ? Object.keys(toSend).length : null
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
        addPeer({id: e.author, sequence: e.sequence})
      })
    )

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

      //handle creating lots of histor streams efficiently.
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

    function localPeers () {
      if(!sbot.gossip) return
      sbot.gossip.peers().forEach(function (e) {
        if (e.source === 'local' && toSend[e.key] == null) {
          sbot.latestSequence(e.key, function (err, seq) {
            addPeer({id: e.key, sequence: err ? 0 : toSeq(seq)})
          })
        }
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

    function friendsLoaded () {
      loadedFriends = true
      debounce.set()
    }

    function addPeer (upto) {
      if(upto.sync) return friendsLoaded()
      if(!upto.id) return console.log('invalid', upto)

      if(toSend[upto.id] == null) {
        toSend[upto.id] = Math.max(toSend[upto.id] || 0, upto.sequence || upto.seq || 0)
        newPeer({id: upto.id, sequence: toSend[upto.id] , type: 'new' })
      } else {
        toSend[upto.id] = Math.max(toSend[upto.id] || 0, upto.sequence || upto.seq || 0)
      }

      debounce.set()
    }


    // create read-streams for the desired feeds
    pull(
      sbot.friends.createFriendStream(opts),
      // filter out duplicates, and also keep track of what we expect to receive
      // lookup the latest sequence from each user
      // TODO: use paramap?
      pull.asyncMap(function (data, cb) {
        if(data.sync) return cb(null, data)
        var id = data.id || data
        sbot.latestSequence(id, function (err, seq) {
          cb(null, {
            id: id, sequence: err ? 0 : toSeq(seq)
          })
        })
      }, 32),
      pull.drain(addPeer, friendsLoaded)
    )

    function upto (opts) {
      opts = opts || {}
      var ary = Object.keys(toSend).map(function (k) {
        return { id: k, sequence: toSend[k] }
      })
      if(opts.live)
        return Cat([pull.values(ary), pull.once({sync: true}), newPeer.listen()])

      return pull.values(ary)
    }

    sbot.on('rpc:connect', function(rpc) {
      // this is the cli client, just ignore.

      if(rpc.id === sbot.id) return
      var errorsSeen = {}

      //check for local peers, or manual connections.
      localPeers()

      var drain

      function replicate(upto, cb) {
        pendingFeedsForPeer[rpc.id] = pendingFeedsForPeer[rpc.id] || new Set()
        pendingFeedsForPeer[rpc.id].add(upto.id)

        debounce.set()

        pull(
          createHistoryStreamWithSync(rpc, upto, function onSync () {
            pendingFeedsForPeer[rpc.id].delete(upto.id)
            debounce.set()
          }),
          sbot.createWriteStream(function (err) {
            if(err && !(err.message in errorsSeen)) {
              errorsSeen[err.message] = true
              if(err.message in streamErrors) {
                cb(err)
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
                console.error('Error replicating with ' + rpc.id + ':\n  ',
                  err.stack)
              }
            }

            pendingFeedsForPeer[rpc.id].delete(upto.id)
            debounce.set()
          })
        )
      }

      sbot.latestSequence(sbot.id, function (err, seq) {
        replicate({
          id: sbot.id, sequence: err ? 0 : toSeq(seq)
        }, function () {})
      })


      rpc.once('call:createHistoryStream', next)

      function next () {

        sbot.emit('replicate:start', rpc)

        rpc.on('closed', function () {
          sbot.emit('replicate:finish', toSend)
        })

        pull(
          upto({live: opts.live}),
          drain = pull.drain(function (upto) {
            if(upto.sync) return
            if(upto.id == sbot.id) return
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
      changes: notify.listen,
      upto: upto,
    }
  }
}

function createHistoryStreamWithSync (rpc, upto, onSync) {
  // HACK: createHistoryStream does not emit sync event, so we don't
  // know when it switches to live. Do it manually!
  var last = (upto.sequence || upto.seq || 0)
  var state = null
  return pullNext(function () {
    if (!state) {
      state = 'old'
      return pull(
        rpc.createHistoryStream({
          id: upto.id,
          seq: last + 1,
          live: false,
          keys: false
        }),
        pull.through(msg => {
          last = Math.max(last, msg.sequence)
        })
      )
    } else if (state === 'old') {
      state = 'sync'
      onSync && onSync(true)
      return rpc.createHistoryStream({
        id: upto.id,
        seq: last + 1,
        live: true,
        keys: false
      })
    }
  })
}



