var rimraf = require('rimraf')
var mkdirp = require('mkdirp')
var osenv = require('osenv')
var merge = require('map-merge')
var path = require('path')
var SBot = require('../')
var ssbKeys = require('ssb-keys')
var create     = require('secure-scuttlebutt/create')


function hash (str) {
  return require('crypto').createHash('sha256').update(str).digest()
}

exports.createDB = function (name, config) {
  var dir = path.join(osenv.tmpdir(), name)
  rimraf.sync(dir)

  var dbDir  = path.join(dir, 'db')
  //load/create  secure scuttlebutt.
  mkdirp.sync(dbDir)


  config = merge({
    path: dir,
  }, config || {})

  var keys = ssbKeys.generate('ed25519', hash(name))
  var ssb = create(dir, null, keys)
  var feed = ssb.createFeed(keys)
  return SBot(config, ssb, feed).use(require('../plugins/logging'))
}
