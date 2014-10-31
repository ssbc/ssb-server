# Scuttlebot

A bot-server for the phoenix network. Provides an RPC server for operating it locally or remotely. Can be `require()`ed to create your own bots.

CLI usage:

```
./scuttlebot serve --port 2000
```

Setup:

```js
var sbot = require('scuttlebot')
var ssbapi = require('secure-scuttlebutt/api')

// with the default api:
var server = sbot.serve(2000, __dirname) // port, (optional) directory to put data
var client = sbot.connect(2000, 'localhost') // port, (optional) hostname

// with a custom API:
var server = sbot.serve(2000, __dirname, function(backend) {
  // return your muxrpc server
  return ssbapi.server(backend.ssb, backend.feed)
})
var client = sbot.connect(2000, 'localhost', ssbapi.client())
```

Default API:

```js
client.whoami(function(err, prof) {
  console.log(prof.id) // => Buffer, the hash of the public key (user id)
  console.log(prof.public) // => Buffer, the public key
})
client.setProfile({ nickname: 'Mr Scuttlebot' })

client.follow(id, function(err))
client.unfollow(id, function(err))
client.isFollowing(id, function(err, bool))
pull(
  client.followedUsers(),
  pull.collect(console.log) // => (err, array of user ids)
)
```

Todos:

 - Add CLI commands for the api
 - Once SSB supports channel authentication, apply a permissions model
 - Once SSB supports link de-indexing (via "delete" messages), make `unfollow()` work (it's broken atm)
 - Add the SSB replication API when that's standardized