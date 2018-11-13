# ssb-server replicate plugin

Sync feeds between peers.


## changes: source

Listen to replicate events.

```bash
changes
```

```js
changes()
```

Emits events of the following form:

```
{ type: 'progress', peerid:, total:, progress:, feeds:, sync: }
```

## upto: source

returns {} of feeds to replicate, with sequences

## request: sync

request a given feed, either as request(id) to replicate that feed,
or request(id, false) to disable replication.

