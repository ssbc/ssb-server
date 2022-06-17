# ssb-server

ssb-server is an open source **peer-to-peer log store** used as a database, identity provider, and messaging system.
It has:

 - Global replication
 - File-synchronization
 - End-to-end encryption

`ssb-server` behaves just like a [Kappa Architecture DB](http://milinda.pathirage.org/kappa-architecture.com/).
In the background, it syncs with known peers.
Peers do not have to be trusted, and can share logs and files on behalf of other peers, as each log is an unforgeable append-only message feed.
This means ssb-servers comprise a [global gossip-protocol mesh](https://en.wikipedia.org/wiki/Gossip_protocol) without any host dependencies.

If you are looking to use ssb-server to run a pub, consider using [ssb-minimal-pub-server](https://github.com/ssbc/ssb-minimal-pub-server) instead.

**Join us in #scuttlebutt on [Libera Chat](https://libera.chat/).**

[![build status](https://secure.travis-ci.org/ssbc/ssb-server.png)](http://travis-ci.org/ssbc/ssb-server)

## Install

How to Install `ssb-server` and create a working pub 

1. `sudo apt install curl autotools-dev automake`

2. Install the Node Version Manager (NVM):

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
```

3. Close and reopen your terminal to start using nvm or run the following:

```
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
```

4. `nvm install 10`

5. `nvm alias default 10`

6. `npm install -g node-gyp`

7. Then to add `ssb-server` to your available CLI commands, install it using the `-g` global flag:

```
npm install -g ssb-server
```

If you are running as the root user this command will fail. Ideally you would run ssb-server as a non-priviledged user, but if you have to run it as root you can do so with `npm install -g ssb-server --unsafe-perm`.

8. `nano ~/run-server.sh` and input:

```
#!/bin/bash
while true; do
  ssb-server start
  sleep 3
done
```

Input Ctrl-X to save and quit.

Be sure to start the pub server from this script (as shown in step 10), as this script will run the pub server and restart it even if it crashes.      

9. `mkdir ~/.ssb/`

10. `nano ~/.ssb/config` and input:

```
{
  "connections": {
    "incoming": {
      "net": [
        { "scope": "public", "host": "0.0.0.0", "external": "Your Host Name or Public IP", "transform": "shs", "port": 8008 }
      ]
    },
    "outgoing": {
      "net": [{ "transform": "shs" }]
    }
  }
}
```

11. Now run `sh ~/run-server.sh` in a detachable session (e.g. screens)

12. Detach the session and run `ssb-server whoami` to check to see if the server is working.

13. Now is the time to think of a really cool name for your new pub server.  Once you have it run:

`ssb-server publish --type about --about {pub-id (this is the output from ssb-server whoami)} --name {Your pubs awesome name}`

14. Now it's time to create those invites! 
Just run `ssb-server invite.create 1` and send those codes to your friends.

Congratulations!  You are now ready to scuttlebutt with your friends! 

>Note for those running `ssb-server` from a home computer.
>You will need to make sure that your router will allow connections to port 8008.  Thus, you will need to forward port 8008 to the local IP address of the computer running the server (look up how to do this online).
>If you haven't done this step, when a client tries to connect to your server using the invite code, they will get an error that your invite code is not valid.



## Applications

There are already several applications built on `ssb-server`,
one of the best ways to learn about secure-scuttlebutt is to poke around in these applications.

* [patchwork](http://github.com/ssbc/patchwork) is a discussion platform that we use to anything and everything concerning ssb and decentralization.
* [patchbay](http://github.com/ssbc/patchbay) is another take on patchwork - it's compatible, less polished, but more modular. The main goal of patchbay is to be very easy to add features to.
* [git-ssb](https://github.com/clehner/git-ssb) is git (& github!) on top of secure-scuttlebutt. Although we still keep our repos on github, primary development is via git-ssb.

It is recommended to get started with patchwork, and then look into git-ssb and patchbay.

## Starting an `ssb-server`

### Command Line Usage Example

Start the server with extra log detail
Leave this running in its own terminal/window
```bash
ssb-server start --logging.level=info
```

### Javascript Usage Example

```js
var Server = require('ssb-server')
var config = require('ssb-config')
var fs = require('fs')
var path = require('path')

// add plugins
Server
  .use(require('ssb-master'))
  .use(require('ssb-gossip'))
  .use(require('ssb-replicate'))
  .use(require('ssb-backlinks'))

var server = Server(config)

// save an updated list of methods this server has made public
// in a location that ssb-client will know to check
var manifest = server.getManifest()
fs.writeFileSync(
  path.join(config.path, 'manifest.json'), // ~/.ssb/manifest.json
  JSON.stringify(manifest)
)
```
see: [github.com/ssbc/**ssb-config**](https://github.com/ssbc/ssb-config) for custom configuration.

## Calling `ssb-server` Functions

There are a variety of ways to call `ssb-server` methods, from a command line as well as in a javascript program.

### Command Line Usage Example

The command `ssb-server` can also used to call the running `ssb-server`.

Now, in a separate terminal from the one where you ran `ssb-server start`, you can run commands such as the following:
```bash
# publish a message
ssb-server publish --type post --text "My First Post!"

# stream all messages in all feeds, ordered by publish time
ssb-server feed

# stream all messages in all feeds, ordered by receive time
ssb-server log

# stream all messages by one feed, ordered by sequence number
ssb-server hist --id $FEED_ID
```

### Javascript Usage Example

Note that the following involves using a separate JS package, called [ssb-client](https://github.com/ssbc/ssb-client). It is most suitable for connecting to a running `ssb-server` and calling its methods. To see further distinctions between `ssb-server` and `ssb-client`, check out this [handbook article](https://handbook.scuttlebutt.nz/guides/ssb-server-context).

```js
var pull = require('pull-stream')
var Client = require('ssb-client')

// create a ssb-server client using default settings
// (server at localhost:8080, using key found at ~/.ssb/secret, and manifest we wrote to `~/.ssb/manifest.json` above)
Client(function (err, server) {
  if (err) throw err

  // publish a message
  server.publish({ type: 'post', text: 'My First Post!' }, function (err, msg) {
    // msg.key           == hash(msg.value)
    // msg.value.author  == your id
    // msg.value.content == { type: 'post', text: 'My First Post!' }
    // ...
  })

  // stream all messages in all feeds, ordered by publish time
  pull(
    server.createFeedStream(),
    pull.collect(function (err, msgs) {
      // msgs[0].key == hash(msgs[0].value)
      // msgs[0].value...
    })
  )

  // stream all messages in all feeds, ordered by receive time
  pull(
    server.createLogStream(),
    pull.collect(function (err, msgs) {
      // msgs[0].key == hash(msgs[0].value)
      // msgs[0].value...
    })
  )

  // stream all messages by one feed, ordered by sequence number
  pull(
    server.createHistoryStream({ id: < feedId > }),
    pull.collect(function (err, msgs) {
      // msgs[0].key == hash(msgs[0].value)
      // msgs[0].value...
    })
  )
})
```

## Use Cases

`ssb-server`'s message-based data structure makes it ideal for mail and forum applications (see [Patchwork](https://ssbc.github.io/patchwork/)).
However, it is sufficiently general to be used to build:

 - Office tools (calendars, document-sharing, tasklists)
 - Wikis
 - Package managers

Because `ssb-server` doesn't depend on hosts, its users can synchronize over WiFi or any other connective medium, making it great for [Sneakernets](https://en.wikipedia.org/wiki/Sneakernet).

`ssb-server` is [eventually-consistent with peers](https://en.wikipedia.org/wiki/Eventual_consistency), and requires exterior coordination to create strictly-ordered transactions.
Therefore, by itself, it would probably make a poor choice for implementing a crypto-currency.
(We get asked that a lot.)

---

### Getting Started

- [Install](https://handbook.scuttlebutt.nz/guides/ssb-server/install) - Setup instructions
- [Tutorial](https://handbook.scuttlebutt.nz/guides/ssb-server/tutorial) - Primer on developing with ssb-server
- [API / CLI Reference](https://scuttlebot.io/apis/scuttlebot/ssb.html) (out of date, but still the best reference)
- [ssb-config](https://github.com/ssbc/ssb-config) - a module which helps build config to start ssb-server with
- [ssb-client](https://github.com/ssbc/ssb-client) - make a remote connection to the server
- [Modules docs](https://modules.scuttlebutt.nz) - see an overview of all the modules

### Key Concepts

- [Secure Scuttlebutt](https://ssbc.github.io/scuttlebutt-protocol-guide/), ssb-server's global database protocol
- [Content Hash Linking](https://ssbc.github.io/docs/ssb/linking.html)
- [Secret Handshake](https://ssbc.github.io/docs/ssb/secret-handshake.html), ssb-server's transport-layer security protocol
- [Private Box](https://ssbc.github.io/docs/ssb/end-to-end-encryption.html), ssb-server's end-to-end security protocol
- [Frequently Asked Questions](https://ssbc.github.io/docs/ssb/faq.html)

### Further Reading

- [Design Challenge: Avoid Centralization and Singletons](https://handbook.scuttlebutt.nz/stories/design-challenge-avoid-centralization-and-singletons)
- [Design Challenge: Sybil Attacks](https://handbook.scuttlebutt.nz/stories/design-challenge-sybil-attacks)
- [Using Trust in Open Networks](https://handbook.scuttlebutt.nz/stories/using-trust-in-open-networks)


# License

MIT
