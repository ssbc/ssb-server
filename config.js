var path = require('path')
var home = require('osenv').home
var nonPrivate = require('non-private-ip')

module.exports = require('rc')('ssb', {
  host: nonPrivate() || '',
  port: 2000,
  timeout: 30000,
  pub: true,
  local: true,
  phoenix: true,
  friends: {
    //dunbar number - this is how many nodes
    //your instance will replicate.
    dunbar: 150,
    //hops - how many friend of friend hops to replicate.
    hops: 3
    //friend feeds are replicated until either the dunbar limit
    //or the hop limit is reached.
  },
  gossip: {
    connections: 2
  },
  path: path.join(home(), '.ssb')
})
