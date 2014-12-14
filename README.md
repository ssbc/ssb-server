# Scuttlebot

A bot-server for the [phoenix network](https://github.com/pfraze/phoenix). Provides an RPC server for operating it locally or remotely. Can be `require()`ed to create your own bots.

[![build status](https://secure.travis-ci.org/pfraze/scuttlebot.png)](http://travis-ci.org/pfraze/scuttlebot)


### CLI usage

```
npm install -g scuttlebot
```
start a server

```
scuttlebot serve
```

then issue commands from another terminal...

```
# add a simple message (type is required, but freeform)
scuttlebot add --type msg --value hello

# get your id
scuttlebot whoami

# follow another instance
scuttlebot add --type follow --follow.'$feed' <id> --follow.'$rel' follows

# add a pub server (this is a server you'll connect to replicate with)

scuttlebot add --type pub --address.host <domain> --address.port <port>

## reading data

# read all messages in order received

scuttlebot log

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


### Setup

```js
var sbot = require('scuttlebot')


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

var rstream = myfeed.createReplicationStream()
pull(rstream, client.createReplicationStream(), rstream)
```

Todos:

 - Add CLI commands for the api
 - Once SSB supports channel authentication, apply a permissions model
 - Once SSB supports link de-indexing (via "delete" messages), make `unfollow()` work (it's broken atm)
 - Add the SSB replication API when that's standardized
