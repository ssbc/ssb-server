#! /usr/bin/env node
var fs           = require('fs')
var path         = require('path')
var pull         = require('pull-stream')
var toPull       = require('stream-to-pull-stream')
var File         = require('pull-file')
var explain      = require('explain-error')
var Config       = require('ssb-config/inject')
var Client       = require('ssb-client')
var createHash   = require('multiblob/util').createHash
var minimist     = require('minimist')
var muxrpcli     = require('muxrpcli')
var cmdAliases   = require('./lib/cli-cmd-aliases')
//var ProgressBar  = require('./lib/progress')
var packageJson  = require('./package.json')

//get config as cli options after --, options before that are
//options to the command.

module.exports = function (config, argv) {
//  var argv = config._
  var manifestFile = path.join(config.path, 'manifest.json')

  // normal command:
  // create a client connection to the server

  // read manifest.json
  var manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile))
  } catch (err) {
    throw explain(err,
      'no manifest file'
      + '- should be generated first time server is run'
    )
  }

  var opts = {
    manifest: manifest,
    port: config.port,
    host: config.host || 'localhost',
    caps: config.caps,
    key: config.key || config.keys.id
  }

  // connect
  Client(config.keys, opts, function (err, rpc) {
    if(err) {
      if (/could not connect/.test(err.message)) {
        console.error('Error: Could not connect to ssb-server ' + opts.host + ':' + opts.port)
        console.error('Use the "start" command to start it.')
        console.error('Use --verbose option to see full error')
        if(config.verbose) throw err
        process.exit(1)
      }
      throw err
    }

    // add aliases
    for (var k in cmdAliases) {
      rpc[k] = rpc[cmdAliases[k]]
      manifest[k] = manifest[cmdAliases[k]]
    }

    // add config command (should we remove this? it's not documented!)
    manifest.config = 'sync'
    rpc.config = function (cb) {
      console.log(JSON.stringify(config, null, 2))
      cb()
    }

    // HACK
    // we need to output the hash of blobs that are added via blobs.add
    // because muxrpc doesnt support the `sink` callback yet, we need this manual override
    // -prf
    if (process.argv[2] === 'blobs.add') {
      var filename = process.argv[3]
      var source =
        filename ? File(process.argv[3])
      : !process.stdin.isTTY ? toPull.source(process.stdin)
      : (function () {
        console.error('USAGE:')
        console.error('  blobs.add <filename> # add a file')
        console.error('  source | blobs.add   # read from stdin')
        process.exit(1)
      })()
      var hasher = createHash('sha256')
      pull(
        source,
        hasher,
        rpc.blobs.add(function (err) {
          if (err)
            throw err
          console.log('&'+hasher.digest)
          process.exit()
        })
      )
      return
    }

    // run commandline flow
    muxrpcli(argv, manifest, rpc, config.verbose)
  })
}

if(!module.parent && process.title != 'browser') {
  var argv = process.argv.slice(2)
  var i = argv.indexOf('--')
  var conf = argv.slice(i+1)
  argv = ~i ? argv.slice(0, i) : argv
  module.exports(Config(process.env.ssb_appname, minimist(conf)), argv)
}

