var assert = require('assert')
var path = require('path')
var fs = require('fs')
var pull = require('pull-stream')
var cat = require('pull-cat')
var pushable = require('pull-pushable')
var toPull = require('stream-to-pull-stream')
var spawn = require('child_process').spawn
var rimraf = require('rimraf')
var mdm = require('mdmanifest')
var valid = require('../lib/validators')
var apidoc = require('../lib/apidocs').plugins

module.exports = {
  name: 'plugins',
  version: '1.0.0',
  manifest: mdm.manifest(apidoc),
  permissions: {
    master: {allow: ['install', 'uninstall']}
  },
  init: function (server, config) {
    var installPath = config.path

    return { 
      install: function (pluginName, opts) {
        var p = pushable()
        var dryRun = opts && opts['dry-run']

        if (!pluginName)
          return pull.error(new Error('plugin name is required'))

        // build args
        // --global-style: dont dedup at the top level, gives proper isolation between each plugin
        // --loglevel error: dont output warnings, because npm just whines about the lack of a package.json in ~/.ssb
        var args = ['install', pluginName, '--global-style', '--loglevel', 'error']
        if (dryRun)
          args.push('--dry-run')

        // exec npm
        var child = spawn('npm', args, { cwd: installPath })
          .on('close', function (code) {
            if (code == 0 && !dryRun)
              p.push(new Buffer('"'+pluginName+'" has been installed. Restart Scuttlebot server to enable the plugin.\n', 'utf-8'))
            p.end()
          })
        return cat([toPull(child.stdout), toPull(child.stderr), p])
      },
      uninstall: function (pluginName, opts) {
        var p = pushable()
        if (!pluginName || typeof pluginName !== 'string')
          return pull.error(new Error('plugin name is required'))

        var modulePath = path.join(installPath, 'node_modules', pluginName)

        rimraf(modulePath, function (err) {
          if (!err)
            p.push(new Buffer('"'+pluginName+'" has been uninstalled. Restart Scuttlebot server to disable the plugin.\n', 'utf-8'))
          else
            p.push(new Buffer(err.toString(), 'utf-8'))
          p.end()
        })
        return p
      }
    }
  }
}

module.exports.loadUserPlugins = function (createSbot, config) {
  // iterate all modules
  var nodeModulesPath = path.join(config.path, 'node_modules')
  try {
    fs.readdirSync(nodeModulesPath).forEach(function (filename) {
      try {
        // load module
        var plugin = require(path.join(nodeModulesPath, filename))

        // check the signature
        assertSbotPlugin(plugin)

        // load
        createSbot.use(plugin)
      } catch (e) {
        console.error('Error loading plugin "'+filename+'":', e.message)
      }
    })
  } catch (e) {
    // node_modules dne, ignore
  }
}

// predictate to check if an object appears to be a sbot plugin
function assertSbotPlugin (obj) {
  // function signature:
  if (typeof obj == 'function')
    return

  // object signature:
  assert(obj && typeof obj == 'object',   'module.exports must be an object')
  assert(typeof obj.name == 'string',     'module.exports.name must be a string')
  assert(typeof obj.version == 'string',  'module.exports.version must be a string')
  assert(obj.manifest &&
         typeof obj.manifest == 'object', 'module.exports.manifest must be an object')
  assert(typeof obj.init == 'function',   'module.exports.init must be a function')
}
