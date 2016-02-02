'use strict'

var childProcess = require('child_process')
var pathlib = require('path')
var url = require('url')
var ipcApiStream = require('./ipc-api-stream')
var muxrpc = require('muxrpc')
var pull = require('pull-stream')
var zerr = require('zerr')

const NODE_PATH = process.execPath
const PLUGIN_LOADER = pathlib.join(__dirname, 'plugin-sandbox.js')

const IPC_MANIFEST = {}
//   registerService: 'sync',
//   queryServices: 'sync'
// }
const IPC_API = {}// registerService, queryServices }
// const NotYetImplementedError = zerr('NotYetImplemented')

var activePlugins = []
var pathRegistry = {}

module.exports.spawn = function (path, manifest) {

  // spawn the process
  var childProcessInstance = childProcess.spawn(NODE_PATH, [PLUGIN_LOADER], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    cwd: pathlib.dirname(path),
    env: {
      script_path: path,
      script_manifest: JSON.stringify(manifest||{})
    }
  })
  console.log(path, '- started.')

  // setup ipc api
  var ipcStream = ipcApiStream(childProcessInstance, function() { console.log(path, '- ipc stream closed.') })
  var ipcApi = muxrpc(manifest || {}, IPC_MANIFEST, msg => msg)(IPC_API)

  // add to the registry
  var plugin = {
    path: path,
    process: childProcessInstance,
    ipcStream: ipcStream,
    ipcApi: ipcApi,
    state: { isAlive: true, code: null, signal: null }
  }
  pathRegistry[path] = plugin
  activePlugins.push(plugin)

  // start the api stream
  ipcApi.id = path
  pull(ipcStream, ipcApi.createStream(), ipcStream)

  // watch for process death
  childProcessInstance.on('close', function (code, signal) {
    console.log(path, '- stopped. Code:', code, 'Signal:', signal)

    // record new state
    plugin.state.isAlive = false
    plugin.state.code = code
    plugin.state.signal = signal

    // remove from registries
    delete pathRegistry[path]
    activePlugins.splice(activePlugins.indexOf(plugin), 1)
  })
  return plugin
}

module.exports.killAll = function (signal) {
  activePlugins.forEach(plugin => plugin.process.kill(signal || 'SIGHUP'))
}