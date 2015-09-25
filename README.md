# Scuttlebot

![Hermies the Hermit Crab](https://avatars2.githubusercontent.com/u/10190339?v=3&s=200)

Secure Scuttlebutt (SSB) is a P2P database of message-feeds.
It consists of

- Per-user append-only logs of messages (i.e. [kappa architecture](http://www.kappa-architecture.com/))
- Content-addressable storage (i.e. `obj.id == hash(obj)`)
- Message distribution over a [gossip network](https://en.wikipedia.org/wiki/Gossip_protocol)

Scuttlebot is an SSB server.

 - [Guide to setup Scuttlebot](https://github.com/ssbc/docs#setup-scuttlebot)
 - [Introduction to using and developing with Scuttlebot](https://github.com/ssbc/docs/blob/master/intro-to-using-sbot.md)
 - [Learn about the Secure Scuttlebutt Protocol](https://github.com/ssbc/docs/blob/master/learn.md)

Join us in #scuttlebutt on freenode.

[![build status](https://secure.travis-ci.org/ssbc/scuttlebot.png)](http://travis-ci.org/ssbc/scuttlebot)

## Links

### [Documentation](https://github.com/ssbc/docs)
### [Informal Pub Servers Registry](https://github.com/ssbc/scuttlebot/wiki/Pub-servers)

## Configuration

Default configuration should be fine.
If you want to know about the details and advanced usage please have a look at [`ssb-config`](https://github.com/ssbc/ssb-config).
Data, keys, and config are stored in `~/.ssb` by default.