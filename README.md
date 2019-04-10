# ssb-server

ssb-server is an open source **peer-to-peer log store** used as a database, identity provider, and messaging system.
It has:

 - Global replication
 - File-synchronization
 - End-to-end encryption

ssb-server behaves just like a [Kappa Architecture DB](http://www.kappa-architecture.com/).
In the background, it syncs with known peers.
Peers do not have to be trusted, and can share logs and files on behalf of other peers, as each log is an unforgeable append-only message feed.
This means ssb-servers comprise a [global gossip-protocol mesh](https://en.wikipedia.org/wiki/Gossip_protocol) without any host dependencies.

If you are looking to use ssb-server to run a pub, consider using [ssb-minimal-pub-server](https://github.com/ssbc/ssb-minimal-pub-server) instead.

**Join us in #scuttlebutt on freenode.**

[![build status](https://secure.travis-ci.org/ssbc/ssb-server.png)](http://travis-ci.org/ssbc/ssb-server)

## Install

a known-working [shrinkwrapped](https://docs.npmjs.com/cli/shrinkwrap.html) version will be installed.

```
npm install -g ssb-server
```

## Applications

There are already several applications built on ssb-server,
one of the best ways to learn about secure-scuttlebutt is to poke around in these applications.

* [patchwork](http://github.com/ssbc/patchwork) is a discussion platform that we use to anything and everything concerning ssb and decentralization.
* [patchbay](http://github.com/ssbc/patchbay) is another take on patchwork - it's compatible, less polished, but more modular. The main goal of patchbay is to be very easy to add features to.
* [git-ssb](https://github.com/clehner/git-ssb) is git (& github!) on top of secure-scuttlebutt. Although we still keep our repos on github, primary development is via git-ssb.

it is recommended to get started with patchwork, and then look into git-ssb and patchbay.

## Example Usage (bash)
```bash
# Start the server with extra log detail
# Leave this running in its own terminal/window
ssb-server start --logging.level=info

# publish a message
ssb-server publish --type post --text "My First Post!"

# stream all messages in all feeds, ordered by publish time
ssb-server feed

# stream all messages in all feeds, ordered by receive time
ssb-server log

# stream all messages by one feed, ordered by sequence number
ssb-server hist --id $FEED_ID
```
## Example Usage (js)

```js
var Server = require('ssb-server')
var config = require('ssb-config')
var fs = require('fs')
var path = require('path')

// add plugins
Server
  .use(require('ssb-server/plugins/master'))
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

elsewhere: 
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

## Use-cases

ssb-server's message-based data structure makes it ideal for mail and forum applications (see [Patchwork](https://ssbc.github.io/patchwork/)).
However, it is sufficiently general to be used to build:

 - Office tools (calendars, document-sharing, tasklists)
 - Wikis
 - Package managers

Because ssb-server doesn't depend on hosts, its users can synchronize over WiFi or any other connective medium, making it great for [Sneakernets](https://en.wikipedia.org/wiki/Sneakernet).

ssb-server is [eventually-consistent with peers](https://en.wikipedia.org/wiki/Eventual_consistency), and requires exterior coordination to create strictly-ordered transactions.
Therefore, by itself, it would probably make a poor choice for implementing a crypto-currency.
(We get asked that a lot.)

---

### Getting Started

- [Install](https://ssbc.github.io/docs/scuttlebot/install.html) - Setup instructions
- [Tutorial](https://ssbc.github.io/docs/scuttlebot/tutorial.html) - Primer on developing with ssb-server
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

- [Design Challenge: Avoid Centralization and Singletons](https://ssbc.github.io/docs/articles/design-challenge-avoid-centralization-and-singletons.html)
- [Design Challenge: Sybil Attacks](https://ssbc.github.io/docs/articles/design-challenge-sybil-attack.html)
- [Using Trust in Open Networks](https://ssbc.github.io/docs/articles/using-trust-in-open-networks.html)


# License

MIT
