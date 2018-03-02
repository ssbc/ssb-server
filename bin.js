#! /usr/bin/env node

var fs           = require('fs')
var path         = require('path')
var pull         = require('pull-stream')
var toPull       = require('stream-to-pull-stream')
var File         = require('pull-file')
var explain      = require('explain-error')
var ssbKeys      = require('ssb-keys')
var stringify    = require('pull-stringify')
var createHash   = require('multiblob/util').createHash
var minimist     = require('minimist')
var muxrpcli     = require('muxrpcli')
var cmdAliases   = require('./lib/cli-cmd-aliases')
var ProgressBar  = require('./lib/progress')
var packageJson  = require('./package.json')

//get config as cli options after --, options before that are
//options to the command.
var argv = process.argv.slice(2)
var i = argv.indexOf('--')
var conf = argv.slice(i+1)
argv = ~i ? argv.slice(0, i) : argv

var config = require('ssb-config/inject')(process.env.ssb_appname, minimist(conf))

var keys = ssbKeys.loadOrCreateSync(path.join(config.path, 'secret'))
if(keys.curve === 'k256')
  throw new Error('k256 curves are no longer supported,'+
                  'please delete' + path.join(config.path, 'secret'))

var manifestFile = path.join(config.path, 'manifest.json')

if (argv[0] == 'server') {
  console.log(packageJson.name, packageJson.version, config.path, 'logging.level:'+config.logging.level)
  console.log('my key ID:', keys.public)

  // special server command:
  // import sbot and start the server

  var createSbot = require('./')
    .use(require('./plugins/plugins'))
    .use(require('./plugins/master'))
    .use(require('./plugins/gossip'))
    .use(require('./plugins/replicate'))
    .use(require('ssb-friends'))
    .use(require('ssb-blobs'))
    .use(require('./plugins/invite'))
    .use(require('./plugins/local'))
    .use(require('./plugins/logging'))
    .use(require('ssb-private'))
    .use(require('ssb-query'))
    .use(require('ssb-links'))
    .use(require('ssb-ws'))

  // add third-party plugins
  require('./plugins/plugins').loadUserPlugins(createSbot, config)

  // start server

  config.keys = keys
  var server = createSbot(config)

  // write RPC manifest to ~/.ssb/manifest.json
  fs.writeFileSync(manifestFile, JSON.stringify(server.getManifest(), null, 2))

  if(process.stdout.isTTY && (config.logging.level != 'info'))
    ProgressBar(server.progress)
} else {

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

  // connect
  require('ssb-client')(keys, {
    manifest: manifest,
    port: config.port,
    host: config.host||'localhost',
    caps: config.caps,
    key: config.key || keys.id
  }, function (err, rpc) {
    if(err) {
      if (/could not connect/.test(err.message)) {
        console.log('Error: Could not connect to the scuttlebot server.')
        console.log('Use the "server" command to start it.')
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

    // add some extra commands
    manifest.version = 'async'
    manifest.config = 'sync'
    rpc.version = function (cb) {
      console.log(require('./package.json').version)
      cb()
    }
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


