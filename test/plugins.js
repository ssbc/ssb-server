var ssbKeys = require('ssb-keys')
var tape    = require('tape')
var u       = require('./util')
var pull    = require('pull-stream')
var osenv   = require('osenv')
var path    = require('path')
var fs      = require('fs')
var createSbot = require('../')

var initialPlugins = createSbot.plugins.slice()
function resetSbot () {
  createSbot.plugins = initialPlugins.slice()
  createSbot.use(require('../plugins/plugins'))
}

tape('install and load plugins', function (t) {

  var aliceKeys = ssbKeys.generate()
  var datadirPath = path.join(osenv.tmpdir(), 'test-plugins1')

  t.test('install plugin', function (t) {

    resetSbot()
    var sbot = createSbot({
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys
    })

    console.log('installing plugin...')
    pull(
      sbot.plugins.install('test-plugin', { from: __dirname + '/test-plugin' }),
      pull.collect(function (err, out) {
        if (err) throw err
        console.log(out.map(function (b) { return b.toString('utf-8') }).join(''))

        t.ok(fs.statSync(path.join(datadirPath, 'node_modules/test-plugin')))

        sbot.close(function () {
          t.end()
        })
      })
    )
  })

  t.test('installed and enabled plugin is loaded', function (t) {

    var config = {
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys,
      plugins: {
        'test-plugin': 'test'
      }
    }
    resetSbot()
    require('../plugins/plugins').loadUserPlugins(createSbot, config)
    var sbot = createSbot(config)

    t.ok(sbot.test)
    t.ok(sbot.test.ping)

    sbot.test.ping('ping', function (err, res) {
      if (err) throw err
      t.equal(res, 'ping pong')

      sbot.close(function () {
        t.end()
      })
    })
  })

  t.test('installed and disabled plugin is not loaded', function (t) {

    var config = {
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys,
      plugins: {
        'test-plugin': false
      }
    }
    resetSbot()
    require('../plugins/plugins').loadUserPlugins(createSbot, config)
    var sbot = createSbot(config)

    t.equal(sbot.test, undefined)

    sbot.close(function () {
      t.end()
    })
  })

  t.test('uninstall plugin', function (t) {

    resetSbot()
    var sbot = createSbot({
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys
    })

    console.log('uninstalling plugin...')
    pull(
      sbot.plugins.uninstall('test-plugin'),
      pull.collect(function (err, out) {
        if (err) throw err
        console.log(out.map(function (b) { return b.toString('utf-8') }).join(''))

        t.throws(function () { fs.statSync(path.join(datadirPath, 'node_modules/test-plugin')) })

        sbot.close(function () {
          t.end()
        })
      })
    )
  })

  t.test('install plugin under custom name', function (t) {

    resetSbot()
    var sbot = createSbot({
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys
    })

    console.log('installing plugin...')
    pull(
      sbot.plugins.install('my-test-plugin', { from: __dirname + '/test-plugin' }),
      pull.collect(function (err, out) {
        if (err) throw err
        console.log(out.map(function (b) { return b.toString('utf-8') }).join(''))

        t.ok(fs.statSync(path.join(datadirPath, 'node_modules/my-test-plugin')))

        sbot.close(function () {
          t.end()
        })
      })
    )
  })

  t.test('installed and enabled plugin is loaded, under custom name', function (t) {

    var config = {
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys,
      plugins: {
        'my-test-plugin': 'test'
      }
    }
    resetSbot()
    require('../plugins/plugins').loadUserPlugins(createSbot, config)
    var sbot = createSbot(config)

    t.ok(sbot.test)
    t.ok(sbot.test.ping)

    sbot.test.ping('ping', function (err, res) {
      if (err) throw err
      t.equal(res, 'ping pong')

      sbot.close(function () {
        t.end()
      })
    })
  })

  t.test('uninstall plugin under custom name', function (t) {

    resetSbot()
    var sbot = createSbot({
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys
    })

    console.log('uninstalling plugin...')
    pull(
      sbot.plugins.uninstall('my-test-plugin'),
      pull.collect(function (err, out) {
        if (err) throw err
        console.log(out.map(function (b) { return b.toString('utf-8') }).join(''))

        t.throws(function () { fs.statSync(path.join(datadirPath, 'node_modules/my-test-plugin')) })

        sbot.close(function () {
          t.end()
        })
      })
    )
  })
})
