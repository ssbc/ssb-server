var tape = require('tape')
var pull = require('pull-stream')
var rimraf = require('rimraf')
var sbot = require('../lib')

var dbpath = require('path').join(__dirname, '.db')
try { rimraf.sync(dbpath) } catch(e) { console.log(e) }

tape('perms', function (t) {
  var server = sbot.serve(1234, __dirname)
  var client = sbot.connect(1234)

  client.auth({ user: 'jail', pass: 'wrong' }, function(err) {
    t.assert(!!err)

    client.auth({ user: 'jail', pass: 'password' }, function(err) {
      if (err) throw err

      client.whoami(function(err) {
        t.assert(!!err)

        client.auth({ user: 'anon', pass: '' }, function(err) {
          if (err) throw err

          client.whoami(function(err) {
            if (err) throw err
            t.end()
            client.socket.end()
            server.close()
          })
        })
      })
    })
  })
})
