![solarpunk scuttlebutt](https://one.camp.scuttlebutt.nz/images/cypherpunk.jpeg)

# ssb-server

Secure Scuttlebutt is **peer-to-peer database** which allows offline-first messaging and coordination between peers.
Within this ecosystem, `ssb-server` is the core module which coordinates: 
 - Global replication
 - File-synchronization
 - End-to-end encryption

This module is the Node.js implementation, see also : Golang / Rust / C

## Table of contents

- [Example Usage](#example-usage)
- API
  - [Javascript API](#javascript-api)
  - [Commandline API](#commandline-api) // TODO - perhaps put this in another file
- Resources
  - [Getting Started](#getting-started)
  - [Key Concepts](#key-concepts)
  - [Inspiration](#inspiration)
 
## Example Usage

Start your peer and see what's methods are available:
```js
var Server = require('ssb-server')
var config = require('ssb-config')

// add plugins
Server
  .use(require('ssb-replicate'))
  .use(require('ssb-friends'))
  .use(require('ssb-gossip'))
  .use(require('ssb-local'))

// start the server with a default config
var server = Server(config)

console.log(server.getManifest())
// => a manifest of all available methods
```

Publish a new message:
```js 
const newMsg = { 
  type: 'post',
  text: 'potluck at my place this friday!'
}

server.publish(newMsg, (err, msg) => {
  console.log(msg)
  // => {
  //   key: '%SABuw7mOMKT5E8g6vp7ZZl8cqJfsIPPF44QpFE6p6sA=.sha256',
  //   value: {
  //     author: '@BIbVppzlrNiRJogxDYz3glUS7G4s4D4NiXiPEAEzxdE=.ed25519',
  //     ...,
  //     content: {
  //       type: 'post',
  //       text: 'potluck at my place this friday!'
  //     },
  //     signature: 'Mtfb13pmnAdyjO.....ed25519',
  //   }
  // }
})
```

Read all messages that have been published (and keep the results streaming in live as new messages arrive from friends!) :
```js 
var pull = require('pull-stream')

pull(
  server.createLogStream({ live: true }),
  pull.drain(msg => {
    console.log(msg)
  })
)
```

Close the server: 

```js
server.close()
```

## API

## More details!

// TODO - some expanding READ MORE sections

<details>
  <summary>What's the database?</summary>
  <p>
  </p>
</details>

<details>
  <summary>More info about where `ssb-server` is in the stack</summary>
  <p>
  </p>
</details>

<details>
  <summary>How replication happens</summary>
  <p>
  </p>
</details>

<details>
  <summary>Example applications</summary>
  <p>
  </p>
</details>






`ssb-server` behaves just like a [Kappa Architecture DB](http://milinda.pathirage.org/kappa-architecture.com/).
In the background, it syncs with known peers.
Peers do not have to be trusted, and can share logs and files on behalf of other peers, as each log is an unforgeable append-only message feed.
This means ssb-servers comprise a [global gossip-protocol mesh](https://en.wikipedia.org/wiki/Gossip_protocol) without any host dependencies.

If you are looking to use ssb-server to run a pub, consider using [ssb-minimal-pub-server](https://github.com/ssbc/ssb-minimal-pub-server) instead.


[![build status](https://secure.travis-ci.org/ssbc/ssb-server.png)](http://travis-ci.org/ssbc/ssb-server)

## Install

To add `ssb-server` to your available CLI commands, install it using the `-g` global flag:
```
npm install -g ssb-server
```

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

- [Design Challenge: Avoid Centralization and Singletons](https://ssbc.github.io/docs/articles/design-challenge-avoid-centralization-and-singletons.html)
- [Design Challenge: Sybil Attacks](https://ssbc.github.io/docs/articles/design-challenge-sybil-attack.html)
- [Using Trust in Open Networks](https://ssbc.github.io/docs/articles/using-trust-in-open-networks.html)


# License

MIT
