var Seal = require('../lib/seal')

module.exports = function (server) {

  var keys = server.feed.keys
  var seal = Seal(server.options)

  function sign(msg) {
    return seal.sign(keys, msg)
  }

  server.on('rpc-connection', function (rpc) {

    rpc.auth(sign({
      role: 'peer',
      ToS: 'be excellent to each other',
      public: keys.public,
      ts: Date.now(),
    }), function (err, res) {
      if(err) return rpc._emit('unauthorized', err)
      // if we got an auth failure,
      // notify other plugins.
      //emit locally...

      rpc._emit('authorized', res)
    })

  })

}
