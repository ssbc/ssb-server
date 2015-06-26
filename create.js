var Scuttlebot = require('./')
module.exports = function (config, cb) {
  var sbot = Scuttlebot(config)

  var rebuild = false
  sbot.ssb.needsRebuild(function (err, b) {
    if (b) {
      rebuild = true
      console.log('Rebuilding indexes to ensure consistency. Please wait...')
      sbot.ssb.rebuildIndex(setup)
    } else
      setup()
  })

  function setup (err) {
    if (err) {
      return cb(explain(err, 'error while rebuilding index'))
    }
    if (rebuild)
      console.log('Indexes rebuilt.')

    sbot
      .use(require('./plugins/logging'))
      .use(require('./plugins/replicate'))
      .use(require('./plugins/gossip'))
      .use(require('./plugins/blobs'))
      .use(require('./plugins/invite'))
      .use(require('./plugins/friends'))

    if (config.local)
      sbot.use(require('./plugins/local'))
    if (config.phoenix)
      sbot.use(require('ssbplug-phoenix'))

    cb(null, sbot)
  }


  return sbot
}
