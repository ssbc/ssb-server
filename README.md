# Scuttlebot

Scuttlebot is an open source **peer-to-peer log store** used as a database, identity provider, and messaging system.
It has:

 - Global replication
 - File-syncronization 
 - End-to-end encryption

Scuttlebot behaves just like a [Kappa Architecture DB](http://www.kappa-architecture.com/).
In the background, it syncs with known peers.
Peers do not have to be trusted, and can share logs and files on behalf of other peers, as each log is an unforgeable append-only message feed.
This means Scuttlebots comprise a [global gossip-protocol mesh](https://en.wikipedia.org/wiki/Gossip_protocol) without any host dependencies.

**Join us in #scuttlebutt on freenode.**

[![build status](https://secure.travis-ci.org/ssbc/scuttlebot.png)](http://travis-ci.org/ssbc/scuttlebot)

## Example Usage

```bash
# In bash:

# publish a message
sbot publish --type post --text "My First Post!"

# stream all messages in all feeds, ordered by publish time
sbot feed

# stream all messages in all feeds, ordered by receive time
sbot log

# stream all messages by one feed, ordered by sequence number
sbot hist $FEED_ID
```
```js
// In javascript:

var pull = require('pull-stream')
var ssbClient = require('ssb-client')

// create a scuttlebot client using default settings
// (server at localhost:8080, using key found at ~/.ssb/secret)
ssbClient(function (err, sbot) {
  if (err) throw err

  // publish a message
  sbot.publish({ type: 'post', text: 'My First Post!' }, function (err, msg) {
    // msg.key           == hash(msg.value)
    // msg.value.author  == your id
    // msg.value.content == { type: 'post', text: 'My First Post!' }
    // ...
  })

  // stream all messages in all feeds, ordered by publish time
  pull(
    sbot.createFeedStream(),
    pull.collect(function (err, msgs) {
      // msgs[0].key == hash(msgs[0].value)
      // msgs[0].value...
    })
  )

  // stream all messages in all feeds, ordered by receive time
  pull(
    sbot.createLogStream(),
    pull.collect(function (err, msgs) {
      // msgs[0].key == hash(msgs[0].value)
      // msgs[0].value...
    })
  )

  // stream all messages by one feed, ordered by sequence number
  pull(
    sbot.createHistoryStream(feedId),
    pull.collect(function (err, msgs) {
      // msgs[0].key == hash(msgs[0].value)
      // msgs[0].value...
    })
  )
})
```

## Use-cases

Scuttlebot's message-based data structure makes it ideal for mail and forum applications (see [Patchwork](https://ssbc.github.io/patchwork/)).
However, it is sufficiently general to be used to build:

 - Office tools (calendars, document-sharing, tasklists)
 - Wikis
 - Package managers

Because Scuttlebot doesn't depend on hosts, its users can synchronize over WiFi or any other connective medium, making it great for [Sneakernets](https://en.wikipedia.org/wiki/Sneakernet).

Scuttlebot is [eventually-consistent with peers](https://en.wikipedia.org/wiki/Eventual_consistency), and requires exterior coordination to create strictly-ordered transactions.
Therefore, by itself, it would probably make a poor choice for implementing a crypto-currency.
(We get asked that a lot.)

---

### Getting Started

- [Install](https://ssbc.github.io/docs/scuttlebot/install.html) - Setup instructions
- [Tutorial](https://ssbc.github.io/docs/scuttlebot/tutorial.html) - Primer on developing with Scuttlebot
- [API / CLI Reference](https://ssbc.github.io/docs/api/scuttlebot.html)

### Key Concepts

- [Secure Scuttlebutt](https://ssbc.github.io/secure-scuttlebutt/), Scuttlebot's global database protocol
- [Content Hash Linking](https://ssbc.github.io/docs/ssb/linking.html)
- [Secret Handshake](https://ssbc.github.io/docs/ssb/secret-handshake.html), Scuttlebot's transport-layer security protocol
- [Private Box](https://ssbc.github.io/docs/ssb/end-to-end-encryption.html), Scuttlebot's end-to-end security protocol
- [Frequently Asked Questions](https://ssbc.github.io/docs/ssb/faq.html)

### Further Reading

- [Design Challenge: Avoid Centralization and Singletons](https://ssbc.github.io/docs/articles/design-challenge-avoid-centralization-and-singletons.html)
- [Design Challenge: Sybil Attacks](https://ssbc.github.io/docs/articles/design-challenge-sybil-attack.html)
- [Using Trust in Open Networks](https://ssbc.github.io/docs/articles/using-trust-in-open-networks.html)