var seal = require('../lib/seal')

module.exports = function (server) {

  var keys = server.feed.keys

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
      // if we got an auth failure,
      // notify other plugins.
      if(err) console.log('err', err.message)
      else console.log('ACCESS GRANTED')
    })

  })

}
