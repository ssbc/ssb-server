var Graphmitter = require('graphmitter')
var pull        = require('pull-stream')
var mlib        = require('ssb-msgs')
var memview     = require('level-memview')

function isFunction (f) {
  return 'function' === typeof f
}

function isString (s) {
  return 'string' === typeof s
}

exports.name = 'friends'
exports.version = '1.0.0'
exports.manifest = {
  all  : 'async',
  hops : 'async'
}

exports.init = function (sbot) {

  var graphs = {
    follow: new Graphmitter(),
    trust: new Graphmitter()
  }
  var config = sbot.config

  // view processor
  var toFeedOpts = { tofeed: true }
  var toFeedTrustsOpts = { tofeed: true, rel: 'trusts' }
  var awaitSync = memview(sbot.ssb, function (msg) {
    if (msg.value.content.type == 'follow') {
      mlib.indexLinks(msg.value.content, toFeedOpts, function (link) {
        if (msg.value.content.rel === 'follows')
          graphs.follow.edge(msg.value.author, link.feed, true)
        else if (msg.value.content.rel === 'unfollows')
          graphs.follow.del(msg.value.author, link.feed)
      })
    }
    else if (msg.value.content.type == 'trust') {
      mlib.indexLinks(msg.value.content, toFeedTrustsOpts, function (link) {
        if (+msg.value.content.value != msg.value.content.value) // numeric (or an empty string)?
          return
        if (msg.value.content.value != 0)
          graphs.trust.edge(msg.value.author, link.feed, (+msg.value.content.value > 0) ? 1 : -1)
        else
          graphs.trust.del(msg.value.author, link.feed)
      })
    }
  }, function() {})

  return {
    all: function (graph, cb) {
      if (typeof graph == 'function') {
        cb = graph
        graph = null
      }
      if (!graph)
        graph = 'follow'
      awaitSync(function () {
        cb(null, graphs[graph] ? graphs[graph].toJSON() : null)
      })
    },
    hops: function (start, graph, opts, cb) {
      if (typeof opts == 'function') { // (start|opts, graph, cb)
        cb = opts
        opts = null
      } else if (typeof graph == 'function') { // (start|opts, cb)
        cb = graph
        opts = graph = null
      }
      opts = opts || {}
      if(isString(start)) { // (start, ...)
        // first arg is id string
        opts.start = start
      } else if (start && typeof start == 'object') { // (opts, ...)
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
        return cb(new Error('Invalid graph type: '+graph))

      awaitSync(function () {
        cb(null, g.traverse(opts))
      })
    }
  }
}
