

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

  var followGraph = new Graphmitter()
  var trustGraph = new Graphmitter()
  var flagGraph = new Graphmitter()
  var config = sbot.config

  function index(graph, type) {
    pull(
      sbot.ssb.messagesByType({type: type, live: true}),
      pull.drain(function (msg) {
        var feed = msg.content.feed || msg.content.$feed
        if(feed) graph.edge(msg.author, feed, true)
      })
    )
  }

  index(followGraph, 'follow')
  index(trustGraph, 'trust')
  index(flagGraph, 'flag')

  //handle the various legacy link types!
  index(followGraph, 'follows')
  index(followGraph, 'auto-follow')

  return {
    all: function (graph) {
      if (!graph || graph == 'follow' || graph == 'follows')
        return followGraph.toJSON()
      if (graph == 'trust' || graph == 'trusts')
        return trustGraph.toJSON()
      if (graph == 'flag' || graph == 'flags')
        return flagGraph.toJSON()
      return null
    },
    hops: function (start, graph) {
      var opts
      if(isString(start))
        opts = {start: start}
      else
        opts = start || {}

      var conf = config.friends || {}
      opts.start  = opts.start || sbot.feed.id
      opts.dunbar = conf.dunbar || 150
      opts.hops   = conf.hops   || 3

      if (!graph || graph == 'follow' || graph == 'follows')
        graph = followGraph
      else if (graph == 'trust' || graph == 'trusts')
        graph = trustGraph
      else if (graph == 'flag' || graph == 'flags')
        graph = flagGraph
      else
        throw new Error('Invalid graph type: '+graph)

      return graph.traverse(opts)
    }
  }
}
