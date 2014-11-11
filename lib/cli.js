var path       = require('path')
var scuttlebot = require('../')
var config     = require('../config')

exports.start = function(opts) {
  if (opts.daemon) {
    // Daemon-mode
    // :TODO:
    var daemon = require("daemonize2").setup({
      main: "./daemon.js",
      name: "scuttlebot",
      pidfile: path.join(__dirname, "../scuttlebot.pid"),
      argv: []
    })
    daemon.start()
  } else {
    // FG mode
    if (opts.port)
      config.port = opts.port
    var server = scuttlebot.fromConfig(config)
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
  var api = scuttlebot.connect(opts)
  for (var k in api) {
    if (typeof api[k] == 'function')
      r.context[k] = api[k].bind(api)
  }
  api.conn.on('error', function(err) {
    console.error(err)
    process.exit(1)
  })
  r.on('exit', function() { api.conn.end() })
}