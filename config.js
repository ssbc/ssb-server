var path = require('path')

var nonPrivate = require('non-private-ip')

module.exports = require('rc')('ssb', {
  hostname: nonPrivate() || '',
  port: 2000,
  timeout: 30000,
  pub: true,
  local: true,
  friends: {
    //dunbar number - this is how many nodes
    //your instance will replicate.
    dunbar: 150,
    //hops - how many friend of friend hops to replicate.
    hops: 3
    //friend feeds are replicated until either the dunbar limit
    //or the hop limit is reached.
  },
  path: path.join(process.env.HOME, '.ssb'),
})
