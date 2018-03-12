var tape = require('tape')

tape('existing api will throw if trying to create multiple servers with the same plugin', function (t) {
  require('../')
    .use(require('../plugins/replicate'))
  t.throws(() => {
    require('../')
      .use(require('../plugins/replicate'))
      .use(require('../plugins/gossip'))
  })
  t.end()
})

tape('createSbot method allows creating multiple servers with the same plugins', function (t) {
  var createSbot = require('../').createSbot

  var sbot1 = createSbot()
    .use(require('../plugins/replicate'))
  var sbot2 = createSbot()
    .use(require('../plugins/replicate'))
    .use(require('../plugins/gossip'))
  t.pass()
  t.end()
})
