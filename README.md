# Scuttlebot

A bot-server for the phoenix network. Provides an RPC server for operating it locally or remotely. Can be `require()`ed to create your own bots.

### CLI usage

```
./scuttlebot serve [--port 2000]
```

To get a convenient REPL:

```
./scuttlebot repl [--host localhost] [--port 2000]
```

In the REPL, a connection will have been established for you, and all of the RPC API will be imported into the toplevel:

```
localhost:2000> whoami(console.log)
localhost:2000> setProfile({ nickname: 'Mr Scuttlebot' })
...
```

### Programmatic usage

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
var client = sbot.connect(2000, 'localhost', ssbapi.client)
```

### Default API

```js
client.auth({user:, pass:}, function(err, perms))
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

var rstream = myfeed.createReplicationStream()
pull(rstream, client.createReplicationStream(), rstream)
```

### Permissions

The RPC channel, by default, only allows `auth`, `whoami`, and `createReplicationStream`. To provide more access to the API, create a `users.json` file like this:

```json
{
  "anon": {
    "pass": "",
    "allow": ["auth", "whoami", "createReplicationStream"]
  },
  "admin": {
    "pass": "password",
    "allow": null
  }
}
```

Set `allow` to `null` to allow all. RPC clients may authenticate by calling `auth({ user: 'username', pass: 'password' })`. Their channel will thereafter have access as defined by the user in the users file.

### Todos

 - Add CLI commands for the api
 - Once SSB supports link de-indexing (via "delete" messages), make `unfollow()` work (it's broken atm)
 - Add the SSB replication API when that's standardized