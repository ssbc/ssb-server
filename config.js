var path = require('path')

module.exports = require('rc')('ssb', {
  hostname: '',
  port: 2000,
  timeout: 3000,
  path: path.join(process.env.HOME, '.ssb')
})
