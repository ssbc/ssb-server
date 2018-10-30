var fs = require('fs')
var test = require('tape')
var spawn = require('child_process').spawn
var exec = require('child_process').exec
var crypto = require('crypto')
var net = require('net')
var mkdirp = require('mkdirp')
var join = require('path').join
var ma = require('multiserver-address')

// travis currently does not support ipv6, becaue GCE does not.
var has_ipv6 = process.env.TRAVIS === undefined

function sbot(t, argv, opts) {
  opts = opts || {}
  // we spawn a shell with job control enabled
  // that starts sbot on the background and then
  // reads from stdin, which is a pipe to our node process
  // When that pipe closes (because we do so when the tests ends, or
  // it happens because our process dies), sbot will be killed
  // by the shell automatically.
  // Because the last command in the shell is 'wait %1', the shells' exit code
  // will be sbot's exit code (which is >128 if it was killed)
  var sh = spawn('bash', [
    '-c', 
    'set -o monitor; echo pwd: $(pwd); node ' + join(__dirname, '../bin.js') + ' ' +
    argv.join(' ') +
    ' & read dummy; echo killing sbot; kill %1; wait %1' 
  ], Object.assign({
    env: Object.assign({}, process.env, {ssb_appname: 'test'}),
    stdio: ['pipe', 'inherit', 'inherit']
  }, opts))

  return function end() {
    console.log('ending ...')
  
    sh.on('exit', function(code) {
      if (code>128) {
        t.comment('sbot was killed as expected')
      } else {
        t.fail('sbot exited with code ' + code)
      }
      t.end()
    })
    // closing shell's stdin will make it kill sbot
    // if it is still running at this point.
    // Either way, we'll get sbot's original exit code
    // in the exit event above.
    sh.stdin.end()
  }
}

function try_often(times, opts, work, done) {
  if (typeof opts == 'function') {
    done = work
    work = opts
    opts = {}
  }
  const delay = 2000
  setTimeout(function() { // delay first try
    work(function(err, result) {
      if (!err) return done(null, result)
      if (opts.ignore && err.message && !err.message.match(opts.ignore)) {
        console.error('Fatal error:', err)
        return done(err)
      }
      if (!times) return done(err)
      console.warn('retry run', times)
      console.error('work(err):', err)
      try_often(times-1, work, done)
    })
  }, delay)
}

function connect(port, host, cb) {
  var done = false
  var socket = net.connect(port, host)
  socket.on('error', function(err) {
    if (done) return
    done = true
    cb(err)
  })
  socket.on('connect', function() {
    if (done) return
    done = true
    cb(null)
  })
}

test('run bin.js server with command line option --host and --port (IPv4)', function(t) {
  var end = sbot(t, [
    'server',
    '--host=127.0.0.1',
    '--port=9001',
    '--ws.port=9002',
    '--path=/tmp/sbot_binjstest_' + Date.now()
  ])

  try_often(10, function work(cb) {
    connect(9001, '127.0.0.1', cb)
  }, function done(err) {
    t.error(err, 'Successfully connect eventually')
    end()
  })
})

if (has_ipv6)
test('run bin.js server with command line option --host and --port (IPv6)', function(t) {
  var end = sbot(t, [
    'server',
    '--host=::1',
    '--port=9001',
    '--ws.port=9002',
    '--path=/tmp/sbot_binjstest_' + Date.now()
  ])
  try_often(10, function work(cb) {
    connect(9001, '::1', cb)
  }, function done(err) {
    t.error(err, 'Successfully connect eventually')
    end()
  })
})

test('run bin.js server with local config file (port, host) (IPv4)', function(t) {
  var dir = '/tmp/sbot_binjstest_' + Date.now()
  mkdirp.sync(dir)
  fs.writeFileSync(join(dir, '.testrc'), JSON.stringify({
    host: '127.0.0.1',
    port: 9001,
    ws: {
      port: 9002
    }
  }))
  var end = sbot(t, [
    'server',
    '--path', dir
  ], {
    cwd: dir
  })

  try_often(10, {
    ignore: /ECONNREFUSED/
  }, function work(cb) {
    connect(9001, '127.0.0.1', cb)
  }, function done(err) {
    t.error(err, 'Successfully connect eventually')
    end()
  })
})

if (has_ipv6)
test('run bin.js server with local config file (port, host) (IPv6)', function(t) {
  var dir = '/tmp/sbot_binjstest_' + Date.now()
  mkdirp.sync(dir)
  fs.writeFileSync(join(dir, '.testrc'), JSON.stringify({
    host: '::',
    port: 9001,
    ws: {
      port: 9002
    }
  }))
  var end = sbot(t, [
    'server',
    '--path', dir
  ], {
    cwd: dir
  })

  try_often(10, function work(cb) {
    connect(9001, '::1', cb)
  }, function done(err) {
    t.error(err, 'Successfully connect eventually')
    end()
  })
})

test('sbot should have websockets and http server by default', function(t) {
  var path = '/tmp/sbot_binjstest_' + Date.now()
  var caps = crypto.randomBytes(32).toString('base64')
  var end = sbot(t, [
    'server',
    '--host=127.0.0.1',
    '--port=9001',
    '--ws.port=9002',
    '--path', path,
    '--caps.shs', caps
  ])

  try_often(10, function work(cb) {
    exec([
      join(__dirname, '../bin.js'),
      'getAddress',
      'device',
      '--',
      '--host=127.0.0.1',
      '--port=9001',
      '--path', path,
      '--caps.shs', caps
    ].join(' '), {
      env: Object.assign({}, process.env, {ssb_appname: 'test'})
    }, function(err, stdout, sderr) {
      if (err) return cb(err)
      cb(null, JSON.parse(stdout))  // remove quotes
    })
  }, function(err, addr) {
    t.error(err, 'sbot getAdress succeeds eventually')
    if (err) return end()

    t.comment('result of sbot getAddress: ' + addr)

    var ws_remotes = ma.decode(addr).filter(function(a) {
      return a.find(function(component) {
        return component.name == 'ws'
      })
    })
    t.equal(ws_remotes.length, 1, 'has one ws remote')
    var remote = ma.encode([ws_remotes[0]])
    // this breaks if multiserver address encoding changes
    t.ok(remote.indexOf('9002') > 0, 'ws address contains expected port')

    // this is a bit annoying. we can't signal ssb-client to load the secret from .path
    // it either has to be the first argument, already loaded
    var key = require('ssb-keys').loadOrCreateSync(join(path, 'secret'))
    require('ssb-client')(key, {
      path: path,
      caps: { shs: caps }, // has to be set when setting any config
      remote: remote
    }, function(err, ssb) {
      t.error(err, 'ssb-client returns no error')
      t.ok(ssb.manifest, 'got manifest from api')
      t.ok(ssb.version, 'got version from api')
      ssb.whoami(function(err, feed) {
        t.error(err, 'ssb.whoami succeeds')
        t.equal(feed.id[0], '@', 'feed.id has @ sigil')
        end()
      })
    })
  })
})
