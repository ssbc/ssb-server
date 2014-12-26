var path = require('path')

var nonPrivate = require('non-private-ip')

module.exports = require('rc')('ssb', {
  hostname: nonPrivate() || '',
  port: 2000,
  timeout: 30000,
  pub: true,
  local: true,
  path: path.join(process.env.HOME, '.ssb'),
})
