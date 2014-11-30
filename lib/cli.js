var path       = require('path')
var pull       = require('pull-stream')
var stringify  = require('pull-stringify')
var toPull     = require('stream-to-pull-stream')
var scuttlebot = require('../')
var config     = require('../config')
var api        = require('./api')
var ssbkeys    = require('ssb-keys')

exports.serve = function(opts) {
  if (opts.port)
    config.port = opts.port
  var server = scuttlebot(config)
  console.log('Scuttlebot now serving on port', config.port)

  function onExit() { /* :TODO: any cleanup? */ process.exit() }
  process.on('SIGINT', onExit).on('SIGTERM', onExit)
}

exports.repl = function(opts, rpcclient) {
  var repl = require('repl')
  var r = repl.start(opts.host + ':' + opts.port + '> ')

  // import the rpc api into the top level
  var api = scuttlebot.connect(opts)
  for (var k in api) {
    if (typeof api[k] == 'function')
      r.context[k] = api[k].bind(api)
  }
  api.conn.on('error', function(err) {
    console.error(err)
    process.exit(1)
  })
  r.on('exit', function() { api.conn.end() })
}

exports.exec = function(cmd) {
  return function(opts) {
    delete opts[0]
    delete opts._
    var keys = require('ssb-keys').loadSync(path.join(config.path, 'secret'))
    var rpc = scuttlebot.createClient({port: config.port, host: 'localhost'})

    // if there's data coming from stdin, pipe that into our command
    if(!process.stdin.isTTY) {
      pull(
        toPull.source(process.stdin),
        pull.collect(function (err, ary) {
          var str = Buffer.concat(ary).toString('utf8')
          var data = JSON.parse(str)
          next(data)
        })
      )
    }
    else
      next(opts)

    function next (data) {
      //set $rel as key name if it's missing.
      defaultRel(data)
      console.log(data)
      rpc.auth(ssbkeys.signObj(keys, {
        role: 'client',
        ts: Date.now(),
        public: keys.public
      }), function (err) {
        if(err) throw err

        var isAsyncCmd = contains(cmd, api.manifest.async)
        if(isAsyncCmd) {
          // massage data as needed
          if (cmd == 'getPublicKey' && data && typeof data == 'object')
            data = data[1]
          if (cmd == 'add' && data && typeof data == 'object')
            data = data[1]
          // run command
          console.log(data)
          rpc[cmd](data, function (err, ret) {
            if(err) throw err
            console.log(JSON.stringify((ret), null, 2))
            process.exit()
          })
        }
        else {
          // run command
          pull(
            rpc[cmd](data),
            stringify('', '\n', '\n\n', 2, JSON.stringify),
            toPull.sink(process.stdout, function (err) {
              if(err) throw err
              process.exit()
            })
          )
        }
      })
    }
  }
}

function isObject (o) {
  return o && 'object' === typeof o && !Buffer.isBuffer(o)
}

// helper, does a contain s?
function contains (s, a) {
  if(!a) return false
  return !!~a.indexOf(s)
}

// helper, sets a default reltype on links which are missing them
function defaultRel (o, r) {
  if(!isObject(o)) return o
  for(var k in o) {
    if(isObject(o[k]))
      defaultRel(o[k], k)
    else if(k[0] === '$' && ~['$msg', '$ext', '$feed'].indexOf(k)) {
      if(!o.$rel)
        o.$rel = r ? r : o.type
    }
  }
  return o
}
