var Graphmitter = require('graphmitter')
var pull        = require('pull-stream')
var mlib        = require('ssb-msgs')
var memview     = require('level-memview')
var pushable    = require('pull-pushable')

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
  hops : 'async',
  createFriendStream: 'source',
  get  : 'sync',
}

exports.init = function (sbot) {

  var graphs = {
    follow: new Graphmitter(),
    flag: new Graphmitter()
  }
  var config = sbot.config

  // view processor
  var syncCbs = []
  function awaitSync (cb) {
    if (syncCbs) syncCbs.push(cb)
    else cb()
  }
  pull(sbot.ssb.createLogStream({ live: true }), pull.drain(function (msg) {
    if (msg.sync) {
      syncCbs.forEach(function (cb) { cb() })
      syncCbs = null
      return
    }

    var c = msg.value.content
    if (c.type == 'contact') {
      mlib.asLinks(c.contact).forEach(function (link) {
        if ('following' in c) {
          if (c.following)
            graphs.follow.edge(msg.value.author, link.feed, true)
          else
            graphs.follow.del(msg.value.author, link.feed)

        }
        if ('flagged' in c) {
          if (c.flagged)
            graphs.flag.edge(msg.value.author, link.feed, c.flagged)
          else
            graphs.flag.del(msg.value.author, link.feed)
        }
      })
    }
  }))

  return {
    get: function (opts) {
      var g = graphs[opts.graph || 'follow']
      if(!g) throw new Error('opts.graph must be provided')
      return g.get(opts.source, opts.dest)
    },
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

    createFriendStream: function (opts) {
      opts = opts || {}
      var start = opts.start || sbot.feed.id
      var graph = graphs[opts.graph || 'follow']
      if(!graph)
        return pull.error(new Error('unknown graph:' + opts.graph))
      var cancel, ps = pushable(function () {
        cancel && cancel()
      })

      //by default, also emit your own key.
      if(opts.self !== false)
        ps.push(start)

      var conf = config.friends || {}
      cancel = graph.traverse({
        start: start,
        hops: opts.hops || conf.hops || 3,
        max: opts.dunbar || conf.dunbar || 150,
        each: function (_, to) {
          if(to !== start) ps.push(to)
        }
      })
      return ps
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
