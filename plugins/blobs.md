# scuttlebot blobs plugin

Send/receive files by content-hashes.


How it works:

  * Get list of wanted blobs via `links`, or explicit calls to `want`.
     Call `wL.queue(hash)`.
  * connected to a peer (managed by gossip plugin): rpc.has wants,
    and subscribe to their blob changes. call `query` on each new connection.
  * when a new message is queued. call `query`
  *. in `download`, 5 workers try to download a blob every 300 ms.
  * `hash` arguments must be valid ssb blob links `&<base64 hash>.sha256`
  A queued blob has a callback.

---

better design:

  each task has it's own queue.
  first is queue for has
  then is queue for download.

  once you know where a file is, move it to the download queue.
  if there arn't any peers to get a file from, put it back in has queue.



## get: source

Get a blob by its ID.

```bash
get {blobid}
```

```js
get(blobid)
```


## has: async

Check if the blob of the given ID is stored in the DB.

```bash
has {blobid}
```

```js
has(blobid, cb)
```



## add: sink

Add a new blob to the DB.

```bash
cat ./file | add [hash]
```

```js
pull(source, add(hash, cb))
```

- hash (base64 string): Optional, expected hash of the file. If the file does not match the hash, it is not stored, and an error is emitted.


## rm: async

Remove a blob from the store.

```bash
rm hash
```

```js
rm(hash, cb)
```

- hash (base64 string): hash of the file.



## ls: source

List the hashes of the blobs in the DB.

```bash
ls
```

```js
ls()
```



## want: async

Begin searching the network for the blob of the given hash.

```bash
want {hash} [--nowait]
```

```js
want(hash, { nowait: }, cb)
```

By default, `want` will not call the `cb` until the blob has been downloaded.
If you want the `cb` to be called immediately, specify `nowait: true`.
The `cb` will be called with true/false as the value, telling you if the blob was already present.



## wants: sync

List the currently-wanted blobs' data-structures.

```bash
wants
```

```js
wants()
```



## changes: source

Listen for any newly-downloaded blobs.

```bash
changes
```

```js
changes()
```

When a blob is downloaded, this stream will emit the hash of the blob.
