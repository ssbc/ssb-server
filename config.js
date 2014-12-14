var path = require('path')

module.exports = require('rc')('ssb', {
  hostname: '',
  port: 2000,
  timeout: 30000,
  pub: true,
  local: true,
  path: path.join(process.env.HOME, '.ssb')
})
