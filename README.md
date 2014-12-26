# Scuttlebot

A bot-server for the [phoenix network](https://github.com/pfraze/phoenix). Provides an RPC server for operating it locally or remotely. Can be `require()`ed to create your own bots.

[![build status](https://secure.travis-ci.org/pfraze/scuttlebot.png)](http://travis-ci.org/pfraze/scuttlebot)

### Join the Scuttlebutt network

set up a local client, join the network, and post messages.
Please post an issue if the following does not work for you.

```
# first, install scuttlebot globally.

> npm install -g scuttlebot

# start your local server

> scuttlebot server

# now, in another tab, issue commands.

> scuttlebot whoami
{
  "id": "wuDDnMxVtk8U9hrueDj/T0itgp5HJZ4ZDEJodTyoMdg=.blake2s",
  "public": "vUadxn7OumI4aaHa3FGNQZ+822rsaPvBeJoM4lQ6ayTZcOHlnb0+u41isdwGQv3t3qw//wvFH6JmeHTpJzmO2w==.k256"
}
```
The `whoami` command outputs your id and your public key. There are
many other commands, but first, join the network.

This sends a request to my pub server and asks it to follow you.
You'll see a similar output if you use this command.
(see also [running your own pub server](#running-your-own-pub-server))

```
> scuttlebot invite.addMe --address 176.58.117.63 --invite lQxwo558zeOct3YvK+GMvACLtPQw2uAjsBTOVmQl2Dw=
[
  {
    "previous": "M9s8ow8TEkVrzrVfdOHs266ABOL58d50TYEduBMYLfM=.blake2s",
    "author": "wuDDnMxVtk8U9hrueDj/T0itgp5HJZ4ZDEJodTyoMdg=.blake2s",
    "sequence": 16,
    "timestamp": 1419570197842,
    "hash": "blake2s",
    "content": {
      "type": "follow",
      "feed": "TNn7v0MsAs8OpQnyRwtsMeROVWGlKnS/ItX966PAWjI=.blake2s",
      "rel": "follows"
    },
    "signature": "6CC1keA+VZJF2vDd2fjwS7ATPdEhSV+IFVaJNobSCkcvS5dz066UR1QNuRzilxlCA1zRo3wDvJm3rIEOWYzQrg==.blake2s.k256"
  },
  {
    "previous": "ylKOsS3KjsKAURQ+U7pDMABnDiMt2xHjpJonzDZCmkw=.blake2s",
    "author": "wuDDnMxVtk8U9hrueDj/T0itgp5HJZ4ZDEJodTyoMdg=.blake2s",
    "sequence": 17,
    "timestamp": 1419570197975,
    "hash": "blake2s",
    "content": {
      "type": "pub",
      "address": "176.58.117.63"
    },
    "signature": "tbGFP/OSLrOxCjXJqjoGNzkpUmFXI4b4pf5t53REEBopDA6XG8oPphC1r3vYKhCvJuLERB8EhvwOs2GNjaOKUA==.blake2s.k256"
  }
]
```

This has connected to my pub server and used a temporary invite token
to tell it to follow you. Now my server will replicate your data for you.
If you create your own pub server you can give out your own invite codes.

### running your own pub server.

If you run a pub server - an ordinary peer, except running with
a static ip address then you can give out your own invite codes
and help support the network.

``` js
# ssh into your server & install scuttlebot

> ssh <user>@<host>
> npm install -g scuttlebot

# run a server like above, but with a public ip, this must be the
# the ip address of the server it's running on. this is my ip,
# yours will be different. (You can use a domain instead of an ip)

> scuttlebot server --host 176.58.117.63

# now in another terminal, create an invitation:

> scuttlebot invite.create 100
{
  "address": "176.58.117.63",
  "id": "TNn7v0MsAs8OpQnyRwtsMeROVWGlKnS/ItX966PAWjI=.blake2s",
  "secret": "15zcLza0aQhBg5kf9+IzcOlzJ88mlDnXlx+5W3BJec4="
}
```

### CLI usage

start a server

```
scuttlebot server
```

then issue commands from another terminal...

```
# add a simple message (type is required, but freeform)
scuttlebot add --type msg --value hello

# get your id
scuttlebot whoami

# follow another instance
scuttlebot add --type follow --feed <id> --rel follows

# add a pub server (this is a server you'll connect to replicate with)
# (if port is the default, :2000 then that can be leftoff)
scuttlebot add --type pub --address <domain:port>

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
