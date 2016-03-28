var assert = require('assert')
var path = require('path')
var fs = require('fs')
var execFile = require('child_process').execFile
var mdm = require('mdmanifest')
var valid = require('../lib/validators')
var apidoc = require('../lib/apidocs').plugins

// plugins plugin
// manage userland plugins

module.exports = {
  name: 'plugins',
  version: '1.0.0',
  manifest: mdm.manifest(apidoc),
  permissions: {
    master: {allow: ['install']}
  },
  init: function (server, config) {
    var installPath = config.path

    return { 
      install: valid.async(function (pluginName, opts, cb) {
        if (typeof opts == 'function') {
          cb = opts
          opts = null
        }

        // go to install directory (eg ~/.ssb)
        process.chdir(installPath)
        server.emit('log:notice', ['sbot', null, 'Installing plugin "'+pluginName+'"', opts])

        // build args
        // --global-style: dont dedup at the top level, gives proper isolation between each plugin
        // --json: output results in json, which we can then read
        var args = ['install', pluginName, '--global-style', '--json']
        if (opts && opts['dry-run'])
          args.push('--dry-run')

        // exec npm
        var child = execFile('npm', args, function (err, stdout, stderr) {
          if (err) {
            server.emit('log:error', ['sbot', null, 'Failed to install plugin "'+pluginName+'"', err.toString()])
            cb(err)
          } else {
            server.emit('log:notice', ['sbot', null, 'Installed plugin "'+pluginName+'"', ])
            var res = {}
            // npm's output should be in json, due to the --json flag
            try { res = JSON.parse(stdout) }
            catch (e) {}
            cb(null, {
              message: 'Restart Scuttlebot server to enable the plugin.',
              installed: res
            })
          }
        })
      })
    }
  },
  loadUserPlugins: function (createSbot, config) {
    // iterate all modules
    var nodeModulesPath = path.join(config.path, 'node_modules')
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
