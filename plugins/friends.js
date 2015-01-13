var Graphmitter = require('graphmitter')
var pull        = require('pull-stream')
var ssbMsgs     = require('ssb-msgs')

function isFunction (f) {
  return 'function' === typeof f
}

function isString (s) {
  return 'string' === typeof s
}

exports.name = 'friends'
exports.version = '1.0.0'
exports.manifest = {
  all  : 'sync',
  hops : 'sync'
}

exports.init = function (sbot) {

  var graphs = {
    follow: new Graphmitter(),
    trust: new Graphmitter()
  }
  var config = sbot.config

  // collect follows
  var toFeedOpts = { tofeed: true }
  pull(
    sbot.ssb.messagesByType({ type: 'follow', keys: false, live: true }),
    pull.drain(function (msg) {
      ssbMsgs.indexLinks(msg.content, toFeedOpts, function (link) {
        if (msg.content.rel === 'follows')
          graphs.follow.edge(msg.author, link.feed, true)
        else if (msg.content.rel === 'unfollows')
          graphs.follow.del(msg.author, link.feed)
      })
    })
  )

  // collect trusts
  var toFeedTrustsOpts = { tofeed: true, rel: 'trusts' }
  pull(
    sbot.ssb.messagesByType({ type: 'trust', keys: false, live: true }),
    pull.drain(function (msg) {
      ssbMsgs.indexLinks(msg.content, toFeedTrustsOpts, function (link) {
        if (+msg.content.value != msg.content.value) // numeric (or an empty string)?
          return
        if (msg.content.value != 0)
          graphs.trust.edge(msg.author, link.feed, (+msg.content.value > 0) ? 1 : -1)
        else
          graphs.trust.del(msg.author, link.feed)
      })
    })
  )

  return {
    all: function (graph) {
      if (!graph)
        graph = 'follow'
      return graphs[graph] ? graphs[graph].toJSON() : null
    },
    hops: function (start, graph, opts) {
      opts = opts || {}
      if(isString(start)) {
        // first arg is id string
        opts.start = start
      } else if (start && typeof start == 'object') {
        // first arg is opts
        for (var k in start)
          opts[k] = start[k]
      }

      var conf = config.friends || {}
      opts.start  = opts.start  || sbot.feed.id
      opts.dunbar = opts.dunbar || conf.dunbar || 150
      opts.hops   = opts.hops   || conf.hops   || 3

      var g = graphs[graph || 'follow']
      if (!g)
        throw new Error('Invalid graph type: '+graph)

      return g.traverse(opts)
    }
  }
}
