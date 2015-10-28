# scuttlebot friends plugin

Query the follow and flag graphs.


## all: async

Fetch the graph structure.

```bash
all [graph]
```

```js
all(graph, cb)
```

 - `graph` (string, default: `follow`): Which graph to view. May be `follow` or `flag`.



## hops: async

List the degrees-of-connection of all known feeds from the given feed.

```bash
hops [start] [graph] [--dunbar number] [--hops number]
```

```js
hops(start, graph, { dunbar:, hops: }, cb)
```

 - `start` (FeedID, default: local user): Which feed to start from.
 - `graph` (string, default: `follow`): Which graph to view. May be `follow` or `flag`.
 - `dunbar` (number, default: 150): Limit on how many feeds to include in the list.
 - `hops` (number, default: 3): Limit on how many hops out the feed needs to be, to be included.



## createFriendStream: source

Live-stream the ids of feeds which meet the given hops query. If `meta`
option is set, then will return steam of `{id, hops}`

```bash
createFriendStream [--start feedid] [--graph follow|flag] [--dunbar number] [--hops number] [--meta]
```

```js
createFriendStream({ start:, graph:, dunbar:, hops: , meta: }, cb)
```

 - `start` (FeedID, default: local user): Which feed to start from.
 - `graph` (string, default: `follow`): Which graph to view. May be `follow` or `flag`.
 - `dunbar` (number, default: 150): Limit on how many feeds to include in the list.
 - `hops` (number, default: 3): Limit on how many hops out the feed needs to be, to be included.



## get: sync

Get the edge between two different feeds.

```bash
get --source {feedid} --dest {feedid} [--graph follow|flag]
```

```js
get({ source:, dest:, graph: }, cb)
```

 - `source` (FeedID): Edge source.
 - `dest` (FeedID): Edge destination.
 - `graph` (string, default: `follow`): Which graph to query. May be `follow` or `flag`.
