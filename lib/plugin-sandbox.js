var vm = require('vm')
var fs = require('fs')
var pathlib = require('path')
var muxrpc = require('muxrpc')
var pull = require('pull-stream')
var ipcApiStream = require('./ipc-api-stream')

const PARENT_IPC_MANIFEST = { /* no methods yet */ }
var child_ipc_manifest = {}

// read child manifest from env vars
try { child_ipc_manifest = JSON.parse(process.env.script_manifest) }
catch (e) {}

// read script
var path = process.env.script_path
var name = pathlib.basename(path)
var script = fs.readFileSync(path, 'utf-8')
if (!script || typeof script !== 'string')
  throw "Failed to read script"

// create module object for the plugin to export with
var vmModule = { exports: {} }

// setup RPC channel with parent process
var ipcStream = ipcApiStream(process, function(err) { console.error(err); throw 'parent-process ipc stream was killed' })
var ipcApi = muxrpc(PARENT_IPC_MANIFEST, child_ipc_manifest, msg => msg)(vmModule.exports) // note, we route the requests to the VM's module.exports
pull(ipcStream, ipcApi.createStream(), ipcStream)

// launch VM
var context = vm.createContext({
  module: vmModule,
  exports: vmModule.exports,
  console: {
    log: console.log.bind(console, name, '-'),
    info: console.info.bind(console, name, '-'),
    warn: console.warn.bind(console, name, '-'),
    error: console.error.bind(console, name, '-')
  },
  sbot: ipcApi
})
var vmInstance = vm.runInContext(script, context)