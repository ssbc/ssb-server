#! /usr/bin/env node

var fs           = require('fs')
var path         = require('path')
var explain      = require('explain-error')
var Config       = require('ssb-config/inject')
var createHash   = require('multiblob/util').createHash
var minimist     = require('minimist')
var ProgressBar  = require('./lib/progress')
var packageJson  = require('./package.json')

//get config as cli options after --, options before that are
//options to the command.
var argv = process.argv.slice(2)
var i = argv.indexOf('--')
var conf = argv.slice(i+1)
argv = ~i ? argv.slice(0, i) : argv

var config = Config(process.env.ssb_appname, minimist(conf))

if (config.keys.curve === 'k256')
  throw new Error('k256 curves are no longer supported,'+
                  'please delete' + path.join(config.path, 'secret'))

var manifestFile = path.join(config.path, 'manifest.json')

if (argv[0] == 'server') {
  console.log('WARNING-DEPRECATION: `sbot server` has been renamed to `ssb-server start`')
  argv[0] = 'start'
}

if (argv[0] == 'start') {
  console.log(packageJson.name, packageJson.version, config.path, 'logging.level:'+config.logging.level)
  console.log('my key ID:', config.keys.public)

  // special start command:
  // import ssbServer and start the server

  var createSsbServer = require('./')
    .use(require('./plugins/onion'))
    .use(require('./plugins/unix-socket'))
    .use(require('./plugins/no-auth'))
    .use(require('../ssb-plugins2'))
    .use(require('./plugins/master'))
    .use(require('ssb-gossip'))
    .use(require('ssb-replicate'))
    .use(require('ssb-friends'))
    .use(require('ssb-blobs'))
    .use(require('ssb-invite'))
    .use(require('./plugins/local'))
    .use(require('./plugins/logging'))
    .use(require('ssb-query'))
    .use(require('ssb-ws'))
    .use(require('ssb-ebt'))
    .use(require('ssb-ooo'))
  // add third-party plugins
  require('../ssb-plugins2').loadUserPlugins(createSsbServer, config)

  if (argv[1] != '--disable-ssb-links') {
    if (!createSsbServer.plugins.find(p => p.name == 'links2')) {
      console.log("WARNING-DEPRECATION: ssb-links not installed as a plugin. If you are using git-ssb, ssb-npm or patchfoo please consider installing it")
      createSsbServer.use(require('ssb-links'))
    }
  }

  // start server
  var server = createSsbServer(config)

  // write RPC manifest to ~/.ssb/manifest.json
  fs.writeFileSync(manifestFile, JSON.stringify(server.getManifest(), null, 2))

  if(process.stdout.isTTY && (config.logging.level != 'info'))
    ProgressBar(server.progress)
} else {
  require('./cli')(config, argv)
}

