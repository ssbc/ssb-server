# Scuttlebot

Secure Scuttlebutt (SSB) is a P2P database of data-feeds.
It consists of

- Per-user append-only logs of messages (i.e. [kappa architecture](http://www.kappa-architecture.com/))
- Content-addressable storage (i.e. `obj.id == hash(obj)`)
- Message distribution over a [gossip network](https://en.wikipedia.org/wiki/Gossip_protocol)

Scuttlebot is an SSB server.
It includes the database, networking, and command-line interface.

Join us in #scuttlebutt on freenode.

[![build status](https://secure.travis-ci.org/ssbc/scuttlebot.png)](http://travis-ci.org/ssbc/scuttlebot)

## Guides

### [Setting Up Scuttlebot](https://github.com/ssbc/docs#setup-scuttlebot)
### [Using Scuttlebot](https://github.com/ssbc/docs/blob/master/intro-to-using-sbot.md)
### [Setting Up a Pub](https://github.com/ssbc/docs#setup-up-a-pub)

## Links

### [Informal Pub Servers Registry](https://github.com/ssbc/scuttlebot/wiki/Pub-servers)
### [Documentation](https://github.com/ssbc/docs)

## Configuration

Default configuration should be fine.
If you want to know about the details and advanced usage please have a look at [`ssb-config`](https://github.com/ssbc/ssb-config).
Data, keys, and config are stored in `~/.ssb` by default.