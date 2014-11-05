var path    = require('path')
var net     = require('net')
var ssb     = require('secure-scuttlebutt')
var ssbKeys = require('ssb-keys')

exports.start = function(opts) {
  if (opts.daemon) {
    // Daemon-mode
    var daemon = require("daemonize2").setup({
      main: "./daemon.js",
      name: "scuttlebot",
      pidfile: path.join(__dirname, "../scuttlebot.pid"),
      argv: []
    })
    daemon.start()
  } else {
    // FG mode
    var server = serve(opts.port)
    console.log('api server listening on', opts.port)
    function onExit() { /* :TODO: any cleanup? */ process.exit() }
    process.on('SIGINT', onExit).on('SIGTERM', onExit)
  }
}

exports.stop = function(opts) {
  var daemon = require("daemonize2").setup({
    main: "./daemon.js",
    name: "scuttlebot",
    pidfile: path.join(__dirname, "../scuttlebot.pid")
  });
  daemon.stop();
}

exports.repl = function(opts, rpcclient) {
  var repl = require('repl')
  var r = repl.start(opts.host + ':' + opts.port + '> ')

  // import the rpc api into the top level
  var api = exports.connect(opts.port, opts.host, rpcclient)
  for (var k in api) {
    if (typeof api[k] == 'function')
      r.context[k] = api[k].bind(api)
  }
  api.socket.on('error', function(err) {
    console.error(err)
    process.exit(1)
  })
  r.on('exit', function() { api.socket.end() })
}

exports.connect = function(port, host, rpcclient) {
  rpcclient = rpcclient || require('./api').client
  return require('./api-client')(port, host, rpcclient)
}

var serve = exports.serve = function(port, dirpath, rpcserver) {
  dirpath     = dirpath || path.join(__dirname, '../')
  rpcserver   = rpcserver || require('./api').server
  var backend = loadBackend(dirpath)
  var server  = net.createServer(require('./api-server')(backend, rpcserver))
  server.listen(port)
  server.backend = backend
  return server
}

var loadBackend = exports.loadBackend = function(dirpath) {
  // load keys, db, ssb, feed
  var keypair
  var privatekeyPath = path.join(dirpath, '.privatekey')
  var dbPath = path.join(dirpath, '.db')
  console.log('Keypair:', privatekeyPath)
  console.log('Database:', dbPath)
  try { keypair      = ssbKeys.loadSync(privatekeyPath) }
  catch (e) {
    console.log('No private key found at', privatekeyPath)
    console.log('...creating a new one')
    keypair = ssbKeys.createSync(privatekeyPath)
  }
  var ssb  = require('secure-scuttlebutt/create')(dbPath)
  var feed = ssb.createFeed(keypair)
  return { ssb: ssb, feed: feed }
}