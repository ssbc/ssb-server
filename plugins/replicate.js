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

    var notify = Notify()
    var newPeer = Notify()

    pull(notify.listen(), pull.log())

    var total=0, progress=0, start, count = 0, rate=0
    var to_send = {}
    var to_recv = {}

    debounce(function () {
      var _progress = progress, _total = total
      progress = 0; total = 0
      for(var k in to_send) progress += to_send[k]
      for(var k in to_recv) total += to_recv[k]
      if(_progress !== progress || _total !== total)
        notify({
          total: _total, progress: _progress, rate: rate
        })
    })

    pull(
      sbot.createLogStream({old: false, live: true, sync: false, keys: false}),
      pull.drain(function (e) {
        console.log(e)
        //track writes per second, mainly used for developing initial sync.
        if(!start) start = Date.now()
        var time = (Date.now() - start)/1000
        if(time >= 1) {
          rate = count / time
          start = Date.now()
          count = 0
        }
        count ++
        addPeer({id: e.author, sequence: e.sequence})
      })
    )


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
      var isNew = false
      if(to_send[upto.id] == null) isNew = true

      to_send[upto.id] = Math.max(to_send[upto.id] || 0, upto.sequence || upto.seq || 0)

      if(isNew) newPeer({id: upto.id, sequence: to_send[upto.id]})
      debounce.set()
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
      // this is the cli client, just ignore.
      if(rpc.id === sbot.id) return

      //check for local peers, or manual connections.
      localPeers()

      var drain

      sbot.emit('log:info', ['replicate', rpc.id, 'start'])
      sbot.emit('replicate:start', rpc)

      pull(
        upto({live: opts.live, sync: false}),
        drain = pull.drain(function (upto) {

          pull(
            rpc.createHistoryStream({
              id: upto.id,
              seq: upto.sequence + 1,
              live: true,
              keys: false
            }),
            pull.filter(function (e) {
              //GUESSING. (maybe remove this?)
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















