var tape = require('tape')

tape('createSsbServer method allows creating multiple servers with the same plugins', function (t) {
  var createSsbServer = require('../').createSsbServer

  var ssbServer1 = createSsbServer()
    .use(require('../plugins/replicate'))
  var ssbServer2 = createSsbServer()
    .use(require('../plugins/replicate'))
    .use(require('../plugins/gossip'))
  t.pass()
  t.end()
})

