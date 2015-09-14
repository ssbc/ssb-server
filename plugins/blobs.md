# scuttlebot blobs plugin

Send/receive blobs as theyre referenced.



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
add(hash)
```

- hash (base64 string): Optional, expected hash of the file. If the file does not match the hash, it is not stored, and an error is emitted.



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