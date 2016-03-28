var assert = require('assert')
var path = require('path')
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
            cb(null, res)
          }
        })
      })
    }
  }
}
