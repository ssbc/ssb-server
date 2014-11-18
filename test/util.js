var level    = require('level-test')()
var sublevel = require('level-sublevel/bytewise')
var SSB      = require('secure-scuttlebutt')

exports.createDB = function (name) {
    return SSB(sublevel(level(name, {
      valueEncoding: require('secure-scuttlebutt/defaults').codec
    })), require('secure-scuttlebutt/defaults'))
}
