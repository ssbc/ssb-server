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

**Join us in #scuttlebutt on freenode.**

[![build status](https://secure.travis-ci.org/ssbc/ssb-server.png)](http://travis-ci.org/ssbc/ssb-server)

## install

```
npm install -g ssb-server
```

This module uses [`npm-shrinkwrap.json`](https://docs.npmjs.com/files/shrinkwrap.json),
which makes it possible install it globally with known dependencies.
You can also use this to install old versions, with dependencies
that worked at that time.

## Applications

There are already several applications built on ssb-server,
one of the best ways to learn about secure-scuttlebutt is to poke around in these applications.

* [patchwork](http://github.com/ssbc/patchwork) is a discussion platform that we use to anything and everything concerning ssb and decentralization.
* [patchbay](http://github.com/dominictarr/patchbay) is another take on patchwork - it's compatible, less polished, but more modular. The main goal of patchbay is to be very easy to add features to.
* [git-ssb](https://github.com/clehner/git-ssb) is git (& github!) on top of secure-scuttlebutt. Although we still keep our repos on github, primary development is via git-ssb.

it is recommended to get started with patchwork, and then look into git-ssb and patchbay.

## Example Usage
```bash
# In bash:

# Start the server with extra log detail
# Leave this running in its own terminal/window
ssb-server server --logging.level=info

# publish a message
ssb-server publish --type post --text "My First Post!"

# stream all messages in all feeds, ordered by publish time
ssb-server feed

# stream all messages in all feeds, ordered by receive time
ssb-server log

# stream all messages by one feed, ordered by sequence number
ssb-server hist --id $FEED_ID
```
```js
// In javascript:

var pull = require('pull-stream')
var ssbClient = require('ssb-client')

// create a ssb-server client using default settings
// (server at localhost:8080, using key found at ~/.ssb/secret)
ssbClient(function (err, ssbServer) {
  if (err) throw err

  // publish a message
  ssbServer.publish({ type: 'post', text: 'My First Post!' }, function (err, msg) {
    // msg.key           == hash(msg.value)
    // msg.value.author  == your id
    // msg.value.content == { type: 'post', text: 'My First Post!' }
    // ...
  })

  // stream all messages in all feeds, ordered by publish time
  pull(
    ssbServer.createFeedStream(),
    pull.collect(function (err, msgs) {
      // msgs[0].key == hash(msgs[0].value)
      // msgs[0].value...
    })
  )

  // stream all messages in all feeds, ordered by receive time
  pull(
    ssbServer.createLogStream(),
    pull.collect(function (err, msgs) {
      // msgs[0].key == hash(msgs[0].value)
      // msgs[0].value...
    })
  )

  // stream all messages by one feed, ordered by sequence number
  pull(
    ssbServer.createHistoryStream({ id: < feedId > }),
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
- [API / CLI Reference](https://scuttlebot.io/apis/scuttlebot/ssb.html)

### Key Concepts

- [Secure Scuttlebutt](https://ssbc.github.io/secure-scuttlebutt/), ssb-server's global database protocol
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
