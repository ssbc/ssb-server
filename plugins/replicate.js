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

//calculate how many messages we will accept this replication
//from a given peer.

var DAY = 1000*60*60*24
var LIMIT = [-1, -1, 100]

var notify = Notify()

function last (a) { return a[a.length - 1] }

function replicate(sbot, config, rpc, cb) {

  function calcLimit (upto) {

    var limit = config.replication && config.replication.limit
    if(!Array.isArray(limit)) limit = LIMIT

    var hopLimit =
      upto.hops < limit.length ? limit[upto.hops] : last(limit)

    if(hopLimit <=0) return hopLimit

    return (
        !upto.ts
      ? hopLimit
      : Math.ceil((Date.now() - upto.ts)/DAY * hopLimit)
    )
  }


    var aborter = Abort()
    var sources = many()
    var sent = 0
    var to_send = {}, to_recv = {}
    var initial = {}
    var replicated = {}
    var debounce = Debounce(100)

    debounce(function () {
      var d = 0, r = 0, f = 0
      for(var id in to_recv) {
        var S = to_send[id] || 0, R = to_recv[id] || 0
        var D = replicated[id] || 0
        if(to_send[id] != null && to_recv[id] != null) {
          f++;
          if(S > R) {
            d += (S - R);
            r += (D - R)
          }
        }
      }
      //progress is
      notify({
        type: 'progress', peerid: rpc.id,
        total: d, progress: r, feeds: f,
        sync: !!(f && (r >= d))
      })
    })

    rpc.on('call:createHistoryStream', function (opts) {
      to_send[opts.id] = (opts.sequence || opts.seq) - 1
      debounce.set()
    })

    //these defaults are for replication
    //so they belong in the replication config
    var opts = config.replication || {}
    opts.hops = opts.hops || 3
    opts.dunbar = opts.dunbar || 150
    opts.live = true
    opts.meta = true

    function toSeq (s) {
      return 'number' === typeof s ? s : s.sequence
    }

    var lastDB = sbot.sublevel('lst')

    pull(
      sbot.friends.createFriendStream(opts),
      aborter,
      pull.through(function (s) {
        to_recv['string' === typeof s ? s  : s.id] = 0
      }),
      //lookup the latest message from a given peer.
      para(function (data, cb) {
        if(data.sync) return cb(null, data)
        var id = data.id || data
        sbot.latestSequence(id, function (err, seq) {
          cb(null, {
            id: id, sequence: err ? 0 : toSeq(seq),
            ts: err ? null : seq.ts,
            hops: data.hops
          })
        })
      }, 32),
      pull.drain(function (upto) {
        to_recv[upto.id] = upto.sequence
        initial[upto.id] = replicated[upto.id] = upto.sequence

        var limit = calcLimit(upto)

        sources.add(
          pull(
            rpc.createHistoryStream({
              id: upto.id, seq: upto.sequence + 1,
              limit: limit,
              live: true , keys: false
            }),
            pull.through(function () {
              if(limit === null || limit--) return
              //REPLICATIOAN BACK PRESSURE
              rpc.close(true)
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

    pull(
      sources,
      pull.through(function (msg) {
        replicated[msg.author] = Math.max(
          replicated[msg.author]||0,
          msg.sequence
        )
        debounce.set()
      }),
      sbot.createWriteStream(function (err) {
        aborter.abort()
        debounce.immediate()

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

    sbot.on('rpc:connect', function(rpc) {
      //this is the cli client, just ignore.
      if(rpc.id === sbot.id) return

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

          var progressSummary = summarizeProgress(progress)
          if (progressSummary)
            sbot.emit('log:notice', ['replicate', rpc.id, 'success', progressSummary])
          sbot.emit('replicate:finish', progress)
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



