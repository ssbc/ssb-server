# Scuttlebot

Scuttlebot is an open source **peer-to-peer log store** used as a database, identity provider, and messaging system.
It has:

 - Global replication
 - File-syncronization 
 - End-to-end encryption

Scuttlebot behaves just like a [Kappa Architecture DB](http://www.kappa-architecture.com/).
In the background, it syncs with known peers.
Peers do not have to be trusted, and can share logs and files on behalf of other peers, as each log is an [unforgeable append-only message feed](https://ssbc.github.io/secure-scuttlebutt).
This means Scuttlebots comprise a [global gossip-protocol mesh](https://en.wikipedia.org/wiki/Gossip_protocol) without any host dependencies.

**Join us in #scuttlebutt on freenode.**

[![build status](https://secure.travis-ci.org/ssbc/scuttlebot.png)](http://travis-ci.org/ssbc/scuttlebot)

## Use-cases

Scuttlebot's message-based data structure makes ideal for mail and forum applications (see [Patchwork](https://ssbc.github.io/patchwork/)).
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

### Technical Documents

- [Secure Scuttlebutt](https://ssbc.github.io/secure-scuttlebutt/), Scuttlebot's global database protocol
  - [Key Concepts](https://ssbc.github.io/docs/ssb/key-concepts.html)
  - [Linking](https://ssbc.github.io/docs/ssb/linking.html)
  - [FAQ](https://ssbc.github.io/docs/ssb/faq.html)
- [Secret Handshake](https://ssbc.github.io/docs/ssb/secret-handshake.html), Scuttlebot's transport-layer security protocol
- [Private Box](https://ssbc.github.io/docs/ssb/end-to-end-encryption.html), Scuttlebot's end-to-end security protocol

### Further Reading

- [Design Challenge: Avoid Centralization and Singletons](https://ssbc.github.io/docs/articles/design-challenge-avoid-centralization-and-singletons.html)
- [Design Challenge: Sybil Attacks](https://ssbc.github.io/docs/articles/design-challenge-sybil-attack.html)
- [Using Trust in Open Networks](https://ssbc.github.io/docs/articles/using-trust-in-open-networks.html)