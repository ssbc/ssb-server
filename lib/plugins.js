var assert = require('assert')
var path = require('path')
var fs = require('fs')
var spawn = require('child_process').spawn
var rimraf = require('rimraf')

module.exports.cliMethods = function (config) {
  var installPath = config.path

  return { 
    install: function (pluginName, opts, cb) {
      if (typeof opts == 'function') {
        cb = opts
        opts = null
      }
      var dryRun = opts && opts['dry-run']

      // build args
      // --global-style: dont dedup at the top level, gives proper isolation between each plugin
      // --loglevel error: dont output warnings, because npm just whines about the lack of a package.json in ~/.ssb
      var args = ['install', pluginName, '--global-style', '--loglevel', 'error']
      if (dryRun)
        args.push('--dry-run')

      // exec npm
      spawn('npm', args, { cwd: installPath, stdio: 'inherit' })
        .on('close', function (code) {
        if (code == 0 && !dryRun)
          console.log('Installed. Restart Scuttlebot server to enable the plugin.')
        cb()
      })
    },
    uninstall: function (pluginName, opts, cb) {
      if (typeof opts == 'function') {
        cb = opts
        opts = null
      }
      if (!installPath || typeof installPath !== 'string')
        return cb(new Error('Plugin name is required'))

      var dryRun = opts && opts['dry-run']
      var modulePath = path.join(installPath, 'node_modules', pluginName)

      if (dryRun) {
        console.log('rm -Rf', modulePath)
        cb()
      } else {
        rimraf(modulePath, function (err) {
          if (!err && !dryRun)
            console.log('Uninstalled. Restart Scuttlebot server to disable the plugin.')
          cb(err)
        })
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
