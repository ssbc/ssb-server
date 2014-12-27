

var Graphmitter = require('graphmitter')
var pull        = require('pull-stream')

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

  var graph = new Graphmitter()
  var config = sbot.config

  //handle the various legacy link types!
  pull(
    sbot.ssb.messagesByType({type: 'follow', live: true}),
    pull.drain(function (msg) {
      var feed = msg.content.feed || msg.content.$feed
      if(feed) graph.edge(msg.author, feed, true)
    })
  )

  pull(
    sbot.ssb.messagesByType({type: 'follows', live: true}),
    pull.drain(function (msg) {
      var feed = msg.content.feed || msg.content.$feed
      if(feed) graph.edge(msg.author, feed, true)
    })
  )

  pull(
    sbot.ssb.messagesByType({type: 'auto-follow', live: true}),
    pull.drain(function (msg) {
      var feed = msg.content.feed || msg.content.$feed
      if(feed) graph.edge(msg.author, feed, true)
    })
  )

  return {
    all: function () {
      return graph.toJSON()
    },
    hops: function (start) {
      var opts
      if(isString(start))
        opts = {start: start}
      else
        opts = start || {}

      var conf = config.friends || {}
      opts.start  = opts.start || sbot.feed.id
      opts.dunbar = conf.dunbar || 150
      opts.hops   = conf.hops   || 3

      return graph.traverse(opts)
    }
  }
}
