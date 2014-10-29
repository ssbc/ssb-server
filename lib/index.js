var path    = require('path')
var net     = require('net')
var http    = require('http')
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
    createServers(opts)
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

var createServers = exports.createServers = function(opts, httpServer) {
  var backend = loadBackend(path.join(__dirname, '../'))

  // create public HTTP server
  httpServer = httpServer || require('./http-server')
  var httpServer = http.createServer(httpServer(opts, backend))
  httpServer.listen(opts.httpport)
  console.log('http server listening on', opts.httpport)

  // create public SSB server
  var replServer = net.createServer(require('./ssb-server')(opts, backend))
  replServer.listen(opts.ssbport)
  console.log('ssb server listening on', opts.ssbport)

  function onExit() { /* :TODO: any cleanup? */ process.exit() }
  process.on('SIGINT', onExit).on('SIGTERM', onExit)
}


var loadBackend = exports.loadBackend = function(dirpath) {
  // load keys, db, ssb, feed
  var privatekeyPath = path.join(dirpath, '.privatekey')
  var keypair
  try { keypair = ssbKeys.loadSync(privatekeyPath) }
  catch (e) {
    console.log('No private key found at', privatekeyPath)
    console.log('...creating a new one')
    keypair = ssbKeys.createSync(privatekeyPath)
  }
  var ssb = require('secure-scuttlebutt/create')(path.join(dirpath, '.db'))
  var feed = ssb.createFeed(keypair)
  return { ssb: ssb, feed: feed }
}