var hasNetwork = require('has-network')

var lastCheck = 0
var lastValue = null

module.exports = function hasNetworkDebounced () {
  if (lastCheck + 1e3 < Date.now()) {
    lastCheck = Date.now()
    lastValue = hasNetwork()
  }
  return lastValue
}
