var tape = require('tape')
var pull = require('pull-stream')
var rimraf = require('rimraf')
var ssbKeys = require('ssb-keys')
var path = require('path')
var sbot = require('../lib')

try { rimraf.sync(path.join(__dirname, '.db')) } catch(e) { console.log(e) }
try { rimraf.sync(path.join(__dirname, '.db2')) } catch(e) { console.log(e) }

tape('createReplicationStream', function (t) {
  var server = sbot.serve(1234, __dirname)
  var client = sbot.connect(1234)

  var keypair = ssbKeys.createSync(path.join(__dirname, '.privatekey2'))
  var ssb  = require('secure-scuttlebutt/create')(path.join(__dirname, '.db2'))
  var feed = ssb.createFeed(keypair)

  server.backend.feed.add({ type: 'text', text: 'hello world!' }, function(err) {
    if (err) throw err

    feed.add({ type: 'follow', $rel: 'follows', $feed: server.backend.feed.id, }, function(err) {
      if (err) throw err

      var s1 = feed.createReplicationStream({ rel: 'follows', progress: console.log.bind(console, 'progress') }, done)
      pull(s1, client.createReplicationStream(), s1)
      
      function done(err) {
        if (err) throw err

        pull(
          ssb.messagesByType({ type: 'text' }),
          pull.collect(function(err, msgs) {
            t.equal(msgs.length, 1)
            t.equal(msgs[0].content.text, 'hello world!')
            t.end()
            client.socket.end()
            server.close()
          })
        )
      }
    })
  })
})
