var assert = require('assert')
var path = require('path')
var fs = require('fs')
var pull = require('pull-stream')
var cat = require('pull-cat')
var many = require('pull-many')
var pushable = require('pull-pushable')
var toPull = require('stream-to-pull-stream')
var spawn = require('cross-spawn')
var mkdirp = require('mkdirp')
var osenv = require('osenv')
var rimraf = require('rimraf')
var mv = require('mv')
var mdm = require('mdmanifest')
var explain = require('explain-error')
var valid = require('../lib/validators')

module.exports = {
  name: 'plugins',
  version: '1.0.0',
  manifest: mdm.manifest(fs.readFileSync(path.join(__dirname, 'plugins.md'), 'utf8')),
  permissions: {
    master: {allow: ['install', 'uninstall', 'enable', 'disable']}
  },
  init: function (server, config) {
    var installPath = config.path
    config.plugins = config.plugins || {}
    mkdirp.sync(path.join(installPath, 'node_modules'))

    // helper to enable/disable plugins
    function configPluginEnabled (b) {
      return function (pluginName, cb) {
        checkInstalled(pluginName, function (err) {
          if (err) return cb(err)

          config.plugins[pluginName] = b 
          writePluginConfig(pluginName, b)
          if (b)
            cb(null, '\''+pluginName+'\' has been enabled. Restart ssb-server to use the plugin.')
          else
            cb(null, '\''+pluginName+'\' has been disabled. Restart ssb-server to stop using the plugin.')
        })
      }
    }

    // helper to check if a plugin is installed
    function checkInstalled (pluginName, cb) {
      if (!pluginName || typeof pluginName !== 'string')
        return cb(new Error('plugin name is required'))
      var modulePath = path.join(installPath, 'node_modules', pluginName)
      fs.stat(modulePath, function (err) {
        if (err)
          cb(new Error('Plugin "'+pluginName+'" is not installed.'))
        else
          cb()
      })
    }

    // write the plugin config to ~/.ssb/config
    function writePluginConfig (pluginName, value) {
      var cfgPath = path.join(config.path, 'config')
      // load ~/.ssb/config
      let existingConfig
      fs.readFile(cfgPath, 'utf-8', (err, data) => {
        if (err) {
          if (err.code === 'ENOENT') {
            // only catch "file not found"
            existingConfig = {}
          } else {
            throw err
          }
        } else {
          existingConfig = JSON.parse(data)
        }


        // update the plugins config
        existingConfig.plugins = existingConfig.plugins || {}
        existingConfig.plugins[pluginName] = value

        // write to disc
        fs.writeFileSync(cfgPath, JSON.stringify(existingConfig, null, 2), 'utf-8')
      })

    }

    return {
      install: valid.source(function (pluginName, opts) {
        var p = pushable()
        var dryRun = opts && opts['dry-run']
        var from   = opts && opts.from

        if (!pluginName || typeof pluginName !== 'string')
          return pull.error(new Error('plugin name is required'))

        // pull out the version, if given
        if (pluginName.indexOf('@') !== -1) {
          var pluginNameSplitted = pluginName.split('@')
          pluginName = pluginNameSplitted[0]
          var version = pluginNameSplitted[1]

          if (version && !from)
            from = pluginName + '@' + version
        }
        
        if (!validatePluginName(pluginName))
          return pull.error(new Error('invalid plugin name: "'+pluginName+'"'))

        // create a tmp directory to install into
        var tmpInstallPath = path.join(osenv.tmpdir(), pluginName)
        rimraf.sync(tmpInstallPath); mkdirp.sync(tmpInstallPath)

        // build args
        // --global-style: dont dedup at the top level, gives proper isolation between each plugin
        // --loglevel error: dont output warnings, because npm just whines about the lack of a package.json in ~/.ssb
        var args = ['install', from||pluginName, '--global-style', '--loglevel', 'error']
        if (dryRun)
          args.push('--dry-run')

        // exec npm
        var child = spawn('npm', args, { cwd: tmpInstallPath })
          .on('close', function (code) {
            if (code == 0 && !dryRun) {
              var tmpInstallNMPath   = path.join(tmpInstallPath, 'node_modules')
              var finalInstallNMPath = path.join(installPath, 'node_modules')

              // delete plugin, if it's already there
              rimraf.sync(path.join(finalInstallNMPath, pluginName))

              // move the plugin from the tmpdir into our install path
              // ...using our given plugin name
              var dirs = fs.readdirSync(tmpInstallNMPath)
                .filter(function (name) { return name.charAt(0) !== '.' }) // filter out dot dirs, like '.bin'
              mv(
                path.join(tmpInstallNMPath,   dirs[0]),
                path.join(finalInstallNMPath, pluginName),
                function (err) {
                  if (err)
                    return p.end(explain(err, '"'+pluginName+'" failed to install. See log output above.'))

                  // enable the plugin
                  // - use basename(), because plugins can be installed from the FS, in which case pluginName is a path
                  var name = path.basename(pluginName)
                  config.plugins[name] = true
                  writePluginConfig(name, true)
                  p.push(Buffer.from('"'+pluginName+'" has been installed. Restart ssb-server to enable the plugin.\n', 'utf-8'))
                  p.end()
                }
              )
            } else
              p.end(new Error('"'+pluginName+'" failed to install. See log output above.'))
          })
        return cat([
          pull.values([Buffer.from('Installing "'+pluginName+'"...\n', 'utf-8')]),
          many([toPull(child.stdout), toPull(child.stderr)]),
          p
        ])
      }, 'string', 'object?'),
      uninstall: valid.source(function (pluginName, opts) {
        var p = pushable()
        if (!pluginName || typeof pluginName !== 'string')
          return pull.error(new Error('plugin name is required'))

        var modulePath = path.join(installPath, 'node_modules', pluginName)

        rimraf(modulePath, function (err) {
          if (!err) {
            writePluginConfig(pluginName, false)
            p.push(Buffer.from('"'+pluginName+'" has been uninstalled. Restart ssb-server to disable the plugin.\n', 'utf-8'))
            p.end()
          } else
            p.end(err)
        })
        return p
      }, 'string', 'object?'),
      enable: valid.async(configPluginEnabled(true), 'string'),
      disable: valid.async(configPluginEnabled(false), 'string')
    }
  }
}

module.exports.loadUserPlugins = function (createSsbServer, config) {
  // iterate all modules
  var nodeModulesPath = path.join(config.path, 'node_modules')
  //instead of testing all plugins, only load things explicitly
  //enabled in the config
  for(var module_name in config.plugins) {
    if(config.plugins[module_name]) {
    var name = config.plugins[module_name]
    if(name === true)
      name = /^ssb-/.test(module_name) ? module_name.substring(4) : module_name

    if (createSsbServer.plugins.some(plug => plug.name === name))
      throw new Error('already loaded plugin named:'+name)
      var plugin = require(path.join(nodeModulesPath, module_name))
      if(!plugin || plugin.name !== name)
        throw new Error('plugin at:'+module_name+' expected name:'+name+' but had:'+(plugin||{}).name)
      assertSsbServerPlugin(plugin)
      createSsbServer.use(plugin)
    }
  }
}

// predictate to check if an object appears to be a ssbServer plugin
function assertSsbServerPlugin (obj) {
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

function validatePluginName (name) {
  if (/^[._]/.test(name))
    return false
  // from npm-validate-package-name:
  if (encodeURIComponent(name) !== name)
    return false
  return true
}



