#! /usr/bin/env node

var fs        = require('fs')
var ws        = require('pull-ws-server')
var path      = require('path')
var pull      = require('pull-stream')
var toPull    = require('stream-to-pull-stream')
var explain   = require('explain-error')
var ssbKeys   = require('ssb-keys')
var stringify = require('pull-stringify')

var config  = require('./config')

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

var isHash = ssbKeys.isHash

function defaultRel (o, r) {
  if(!isObject(o)) return o
  for(var k in o) {
    if(isObject(o[k]))
      defaultRel(o[k], k)
    else if(isHash(o[k]) && ~['msg', 'ext', 'feed'].indexOf(k)) {
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
  var server = require('./').init(config)

  fs.writeFileSync(
    manifestFile,
    JSON.stringify(server.getManifest(), null, 2)
  )

  return
}

if(arg && Object.keys(opts).length === 0)
  opts = arg

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

var rpc = require('./client')(config, manifest, function (err) {
    if(err) throw err
  })

var isStdin = ~process.argv.indexOf('.') || ~process.argv.indexOf('--')

if(!process.stdin.isTTY && isStdin) {
  pull(
    toPull.source(process.stdin),
    pull.collect(function (err, ary) {
      var str = Buffer.concat(ary).toString('utf8')
      var data = JSON.parse(str)
      console.log(data)
      next(data)
    })
  )
}
else
  next(opts)

function toBase64() {
  return pull.map(function (b) { return b.toString('base64') })
}

function next (data) {
  //set $rel as key name if it's missing.
  defaultRel(data)
  //TODO: USE SOMETHING ACTUALLY SECURE!
  //like, sign the timestamp with the
  //so if the server sees you are using
  //a trusted key, then allow it.

  //this would also work for replication...
  //which would allow blocking...

  rpc.auth(ssbKeys.signObj(keys, {
    role: 'client',
    ts: Date.now(),
    public: keys.public
  }), function (err) {
    if(typeof data == 'object' && Object.keys(data).length === 0)
      data = null
    if(err) {
      if(err.code === 'ECONNREFUSED')
        throw explain(err, 'Scuttlebot server is not running')
      else
        throw explain(err, 'auth failed')
    }
    if('async' === type || type === 'sync') {
      get(rpc, cmd)(data, function (err, ret) {
        if(err) throw explain(err, 'async call failed')
        console.log(JSON.stringify(ret, null, 2))
        process.exit()
      })
    }
    else if('source' === type)
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
        toBase64(),
        get(rpc, cmd)(data, function (err) {
          if(err) throw explain(err, 'writing stream failed')
          process.exit()
        })
      )
    else
      throw new Error('api did not have a method:' + cmd.join('.'))
  })
}
