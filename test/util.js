var rimraf = require('rimraf')
var osenv = require('osenv')
var merge = require('map-merge')
var path = require('path')
var SBot = require('../')

exports.createDB = function (name, config) {
  var dir = path.join(osenv.tmpdir(), name)

  rimraf.sync(dir)

  config = merge({
    path: dir,
  }, config || {})

  return SBot(config)
}
