var fs = require('fs')
var test = require('tape')
var spawn = require('child_process').spawn
var net = require('net')
var mkdirp = require('mkdirp')
var join = require('path').join

test('run bin.js server with command line option --host and --port (IPv4)', function(t) {
  var sbot = spawn(join(__dirname, '../bin.js'),  [
    'server',
    '--host=127.0.0.1',
    '--port=50999',
    '--ws.port=51000',
    '--path=/tmp/' + Date.now()
  ], {
    stdio: 'inherit'
  })

  sbot.on('exit', function(code) {
    t.notOk(code, 'sbot exit code should be zero')
    t.end()
  })

  setTimeout( function() {
    var socket = net.connect(50999, '127.0.0.1')
    socket.on('error', function(err) {
      t.fail(err)
      sbot.kill('SIGINT')
    })
    socket.on('connect', function(err) {
      t.pass('connected successfully')
      sbot.kill('SIGINT')
    })
  }, 1200)
})

test('run bin.js server with command line option --host and --port (IPv6)', function(t) {
  var sbot = spawn(join(__dirname, '../bin.js'),  [
    'server',
    '--host=::1',
    '--port=50999',
    '--ws.port=51000',
    '--path=/tmp/' + Date.now()
  ], {
    stdio: 'inherit'
  })

  sbot.on('exit', function(code) {
    t.notOk(code, 'sbot exit code should be zero')
    t.end()
  })

  setTimeout( function() {
    var socket = net.connect(50999, '::1')
    socket.on('error', function(err) {
      t.fail(err)
      sbot.kill('SIGINT')
    })
    socket.on('connect', function(err) {
      t.pass('connected successfully')
      sbot.kill('SIGINT')
    })
  }, 1200)
})

test('run bin.js server with local config file (port, host)', function(t) {
  var dir = '/tmp/' + Date.now()
  mkdirp.sync(dir)
  fs.writeFileSync(join(dir, '.testrc'), JSON.stringify({
    host: '127.0.0.1',
    port: 50998,
    ws: {
      port: 50997
    }
  }))
  var sbot = spawn(join(__dirname, '../bin.js'),  [
    'server',
    `--path=${dir}`
  ], {
    env: Object.assign({}, process.env, {ssb_appname: 'test'}),
    cwd: dir,
    stdio: 'inherit'
  })

  sbot.on('exit', function(code) {
    t.notOk(code, 'sbot exit code should be zero')
    t.end()
  })

  setTimeout( function() {
    var socket = net.connect(50998, '127.0.0.1')
    socket.on('error', function(err) {
      t.fail(err)
      sbot.kill('SIGINT')
    })
    socket.on('connect', function(err) {
      t.pass('connected successfully')
      sbot.kill('SIGINT')
    })
  }, 1200)
})

