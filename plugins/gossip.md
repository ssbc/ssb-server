# scuttlebot gossip plugin

Schedule connections randomly with a peerlist constructed from config, multicast UDP announcements, feed announcements, and API-calls.



## peers: sync

Get the current peerlist.

```bash
peers
```

```js
peers(cb)
```



## add: sync

Add an address to the peer table.

```bash
add {addr}
add --host {string} --port {number} --key {feedid}
```

```js
add(addr, cb)
add({ host:, port:, key: }, cb)
```

 - `addr` (address string): An address string, of the following format: `hostname:port:feedid`.
 - `host` (host string): IP address or hostname.
 - `port` (port number)
 - `key` (feedid)

## ping: duplex

used internally by the gossip plugin to measure latency and clock skew

## connect: async

Add an address to the peer table, and connect immediately.

```bash
connect {addr}
connect --host {string} --port {number} --key {feedid}
```

```js
connect(addr, cb)
connect({ host:, port:, key: }, cb)
```

 - `addr` (address string): An address string, of the following format: `hostname:port:feedid`.
 - `host` (host string): IP address or hostname.
 - `port` (port number)
 - `key` (feedid)


## changes: source

Listen for gossip events.

```bash
changes
```

```js
changes()
```

Events come in the following forms:

```
{ type: 'discover', peer:, source: }
{ type: 'connect', peer: }
{ type: 'connect-failure', peer: }
{ type: 'disconnect', peer: }
```

## reconnect: sync

Tell sbot to reinitiate gossip connections now.


