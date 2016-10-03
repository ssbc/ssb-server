'use strict'
var pull = require('pull-stream')
var para = require('pull-paramap')
var Notify = require('pull-notify')
var many = require('pull-many')
var Cat = require('pull-cat')
var Abort = require('pull-abortable')
var Debounce = require('observ-debounce')
var mdm = require('mdmanifest')
var apidoc = require('../lib/apidocs').replicate

var Pushable = require('pull-pushable')

// compatibility function for old implementations of `latestSequence`
function toSeq (s) {
  return 'number' === typeof s ? s : s.sequence
}

function last (a) { return a[a.length - 1] }

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

    var total=0, progress=0, start, count = 0, rate=0
    var to_send = {}
    var to_recv = {}
    var feeds = 0

    debounce(function () {
      var _progress = progress, _total = total
      progress = 0; total = 0
      for(var k in to_send) progress += to_send[k]

      for(var k in to_recv)
        if(to_send[k] !== null)
          total += to_recv[k]

      if(_progress !== progress || _total !== total) {
        notify({
            id: sbot.id,
            total: total, progress: progress, rate: rate,
            feeds: feeds
          })
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

    //keep track of maximum requested value, per feed.
    sbot.createHistoryStream.hook(function (fn, args) {
      var upto = args[0] || {}
      var seq = upto.sequence || upto.seq
      to_recv[upto.id] = Math.max(to_recv[upto.id] || 0, seq)
      if(this._emit) this._emit('call:createHistoryStream', args[0])

      //if we are calling this locally, skip cleverness
      if(this===sbot) return fn.call(this, upto)

      debounce.set()

      //handle creating lots of histor streams efficiently.
      //maybe this could be optimized in map-filter-reduce queries instead?
      if(to_send[upto.id] == null || (seq > to_send[upto.id])) {
        upto.old = false
        if(!upto.live) return pull.empty()
        var pushable = listeners[upto.id] = listeners[upto.id] || []
        var p = Pushable(function () {
          var i = pushable.indexOf(p)
          pushable.splice(i, 1)
        })
        pushable.push(p)
        pushable.sequence = upto.sequence
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
      if(upto.sync) return
      if(!upto.id) return console.log('invalid', upto)

      if(to_send[upto.id] == null) {
        to_send[upto.id] = Math.max(to_send[upto.id] || 0, upto.sequence || upto.seq || 0)
        newPeer({id: upto.id, sequence: to_send[upto.id] , type: 'new' })
      } else
        to_send[upto.id] = Math.max(to_send[upto.id] || 0, upto.sequence || upto.seq || 0)

      debounce.set()
    }


    // create read-streams for the desired feeds
    var S = false
    pull(
      sbot.friends.createFriendStream(opts),
      // filter out duplicates, and also keep track of what we expect to receive
      // lookup the latest sequence from each user
      para(function (data, cb) {
        if(data.sync) return cb(null, S = data)
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
        return Cat([pull.values(ary), pull.once({sync: true}), newPeer.listen()])

      return pull.values(ary)
    }

    sbot.on('rpc:connect', function(rpc) {
      // this is the cli client, just ignore.
      if(rpc.id === sbot.id) return
      //check for local peers, or manual connections.
      localPeers()
      var drain
      sbot.emit('replicate:start', rpc)
      rpc.on('closed', function () {
        sbot.emit('replicate:finish', to_send)
      })
      var SYNC = false
      pull(
        upto({live: opts.live}),
        drain = pull.drain(function (upto) {
          if(upto.sync) return
          feeds++
          debounce.set()
          pull(
            rpc.createHistoryStream({
              id: upto.id,
              seq: (upto.sequence || upto.seq || 0) + 1,
              live: true,
              keys: false
            }),
            sbot.createWriteStream(function (err) {
              if(err) console.error(err.stack)

              feeds--
              debounce.set()
            })
          )

        }, function (err) {
          if(err)
            sbot.emit('log:error', ['replication', rep.id, 'error', err])
        })
      )
    })

    return {
      changes: notify.listen,
      upto: upto,
    }
  }
}









