#! /usr/bin/env node

var fs           = require('fs')
var path         = require('path')
var msgs         = require('ssb-msgs')
var pull         = require('pull-stream')
var toPull       = require('stream-to-pull-stream')
var explain      = require('explain-error')
var ssbKeys      = require('ssb-keys')
var stringify    = require('pull-stringify')
var createHash   = require('multiblob/util').createHash
var createClient = require('./client')
var parse        = require('mynosql-query')
var isRef        = require('ssb-ref')

var config  = require('ssb-config')

var keys = ssbKeys.loadOrCreateSync(path.join(config.path, 'secret'))

var aliases = {
  feed: 'createFeedStream',
  history: 'createHistoryStream',
  hist: 'createHistoryStream',
  public: 'getPublicKey',
  pub: 'getPublicKey',
  log: 'createLogStream',
  conf: 'config'
}

function isObject (o) {
  return o && 'object' === typeof o && !Buffer.isBuffer(o)
}

function isString (s) {
  return 'string' === typeof s
}

function defaultRel (o, r) {
  if(!isObject(o)) return o
  for(var k in o) {
    if(isObject(o[k]))
      defaultRel(o[k], k)
    else if(isRef(o[k]) && ~['msg', 'ext', 'feed'].indexOf(k)) {
      if(!o.rel)
        o.rel = r ? r : o.type
    }
  }
  return o
}

function usage () {
  console.error('sbot {cmd} {options}')
  process.exit(1)
}

var opts = require('minimist')(process.argv.slice(2))
var cmd = opts._[0]
var arg = opts._[1]

delete opts._

var manifestFile = path.join(config.path, 'manifest.json')

cmd = aliases[cmd] || cmd

if(cmd === 'server') {
  require('./').init(config, function (err, server) {
    if(err) throw err

    // Ensure the feed is init'd
    server.ssb.getLatest(keys.id, function (err, msg) {
      if(!msg) server.feed.init()
    });

    fs.writeFileSync(
      manifestFile,
      JSON.stringify(server.getManifest(), null, 2)
    )

  })
  return
}

if(arg && Object.keys(opts).length === 0)
  opts = arg

if(cmd === 'version') {
  console.log(require('./package.json').version)
  process.exit()
}

if(cmd === 'config') {
  console.log(JSON.stringify(config, null, 2))
  process.exit()
}

function get(obj, path) {
  path.forEach(function (k) {
    obj = obj ? obj[k] : null
  })
  return obj
}

if(!cmd) return usage()

cmd = cmd.split('.')
var manifest
try {
  manifest = JSON.parse(fs.readFileSync(manifestFile))
} catch (err) {
  throw explain(err,
    'no manifest file'
    + '- should be generated first time server is run'
  )
}

var type = get(manifest, cmd)

if(!type) return usage()
var rpc

createClient(keys, manifest)
({port: config.port, host: config.host, key: keys.public}, function (err, rpc) {
  if(err) throw err

  next1(rpc)
})

function next1(rpc) {

  var isStdin = ('.' === arg || '--' === arg)

  if(!process.stdin.isTTY && isStdin) {
    pull(
      toPull.source(process.stdin),
      pull.collect(function (err, ary) {
        var str = Buffer.concat(ary).toString('utf8')
        var data = JSON.parse(str)
        console.log(data)
        next2(data)
      })
    )
  }
  else
    next2(opts)

  function next2 (data) {

    if(cmd.toString() === 'query' && arg) {
      data = !isObject(data) ? {} : data
      data.query = parse(arg)
      console.error(data)
    }

    // handle add specially, so that external links (ext)
    // can be detected, and files uploaded first.
    // then the message is created and everything is in a valid state.

    if(cmd.toString() === 'publish' && !isStdin) {
      //parse and add ext links before adding message.
      var n = 0
      msgs.indexLinks(data, function (link) {
        if(isString(link.ext)) {
          n++
          var hasher = createHash()
          var source = (
              /^(\.|--)$/.test(link.ext)
            ? toPull.source(process.stdin)
            : 0 === link.ext.indexOf('./')
            ? toPull.source(fs.createReadStream(link.ext))
            : (function () { throw new Error('cannot process ext:'+link.ext) })()
          )

          pull(
            source,
            hasher,
            rpc.blobs.add(function (err) {
              if(err) return next(err)
              link.ext = hasher.digest
              if(link.size == null) link.size = hasher.size
              next()
            })
          )
        }
      })

      if(n == 0) n = 1, next()

      function next (err) {
        if(err && n > 0) { n = -1; throw err }
        if(--n) return
        rpc.publish(data, function (err, ret) {
          if(err) throw err
          console.log(JSON.stringify(ret, null, 2))
          process.exit()
        })
      }

    }

    else if('async' === type || type === 'sync') {
      get(rpc, cmd)(data, function (err, ret) {
        if(err) throw err
        console.log(JSON.stringify(ret, null, 2))
        process.exit()
      })
    }
    else if('source' === type)
      //TODO: handle binary sources. this will require a different
      //s  erialization, specially for muxrpc... that can handle
      //JSON and length delimitation.
      pull(
        get(rpc, cmd)(data),
        stringify('', '\n', '\n\n', 2, JSON.stringify),
        toPull.sink(process.stdout, function (err) {
          if(err) throw explain(err, 'reading stream failed')
          process.exit()
        })
      )
    else if('sink' === type)
      pull(
        toPull.source(process.stdin),
        get(rpc, cmd)(data, function (err, res) {
          if(err) throw explain(err, 'writing stream failed')
          console.log(JSON.stringify(res, null, 2))
          process.exit()
        })
      )
    else
      throw new Error('api did not have a method:' + cmd.join('.'))
  }
}
