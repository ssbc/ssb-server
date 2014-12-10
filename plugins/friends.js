

var Graphmitter = require('graphmitter')
var pull        = require('pull-stream')

function isFunction (f) {
  return 'function' === typeof f
}

exports.name = 'friends'
exports.version = '1.0.0'
exports.manifest = {
  all  : 'async',
  hops : 'async'
}

function maybeAsync (fun) {
  return function (opts, cb) {
    if(!isFunction(cb))
      return fun.call(this, opts)
    else
      cb(null, fun.call(this, opts))
  }
}

exports.init = function (sbot) {

  var graph = new Graphmitter()

  pull(
    sbot.ssb.messagesByType({type: 'follow', live: true}),
    pull.drain(function (msg) {
      var feed = msg.content.feed || msg.content.$feed
      if(feed) graph.edge(msg.author, feed, true)
    })
  )

  return {
    all: maybeAsync(function () {
      return graph.toJSON()
    }),
    hops: maybeAsync(function (start) {
      if(!start) start = sbot.feed.id
      var s = {}
      s[start] = 0
      var queue = [{key: start, hops: 1}]

      function hops (start, n, m) {
        if(n > m) return
        if(!graph.nodes[start]) return
        graph.nodes[start]
          .each(function (k) {
            if(s[k] !== undefined) return
            s[k] = n
            queue.push({key: k, hops: n+1})
          })
      }

      while(queue.length) {
        var o = queue.shift()
        hops(o.key, o.hops, 2)
      }

      return s
    })
  }
}
