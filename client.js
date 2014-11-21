#! /usr/bin/env node
var ws = require('pull-ws-server')
var path = require('path')

var api = require('./lib/api')
var config = require('./config')
var opts = require('ssb-keys')
var seal = require('./lib/seal')(opts)

var pull = require('pull-stream')
//var duplex = require('stream-to-pull-stream').duplex
var stringify = require('pull-stringify')
var toPull = require('stream-to-pull-stream')

var rpc = api.client().permissions({allow: []})

var keys = require('ssb-keys').loadSync(path.join(config.path, 'secret'))

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

function contains (s, a) {
  if(!a) return false
  return !!~a.indexOf(s)
}

function usage () {
  console.error('sbot {cmd} {options}')
  process.exit(1)
}

var opts = require('minimist')(process.argv.slice(2))
var cmd = opts._[0]
var arg = opts._[1]
delete opts._

cmd = aliases[cmd] || cmd

if(cmd === 'server')
  return require('./')(config)
    .use(require('./plugins/replicate'))
    .use(require('./plugins/gossip'))

if(arg && Object.keys(opts).length === 0)
  opts = arg

if(cmd === 'config') {
  console.log(JSON.stringify(config, null, 2))
  process.exit()
}

var async  = contains(cmd, api.manifest.async)
var source = contains(cmd, api.manifest.source)

if(!async && !source)
  return usage()

var stream = ws.connect({port: config.port, host: 'localhost'})

pull(
  stream,
  rpc.createStream(function (err) {
    if(err) throw err
  }),
  stream
)

if(!process.stdin.isTTY) {
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

function next (data) {
  //set $rel as key name if it's missing.
  defaultRel(data)
  //TODO: USE SOMETHING ACTUALLY SECURE!
  //like, sign the timestamp with the
  //so if the server sees you are using
  //a trusted key, then allow it.

  //this would also work for replication...
  //which would allow blocking...

  rpc.auth(seal.sign(keys, {
    role: 'client',
    ts: Date.now(),
    public: keys.public
  }), function (err) {
    if(err) throw err
    if(async) {
      rpc[cmd](data, function (err, ret) {
        if(err) throw err
        console.log(JSON.stringify(ret, null, 2))
        process.exit()
      })
    }
    else
      pull(
        rpc[cmd](data),
        stringify('', '\n', '\n\n', 2, JSON.stringify),
        toPull.sink(process.stdout, function (err) {
          if(err) throw err
          process.exit()
        })
      )
  })
}
