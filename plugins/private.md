# scuttlebot private plugin

Methods to publish and decrypt secret messages.



## publish: async

Publish an encrypted message.

```bash
*this can not be used from the commandline*
```

```js
publish(content, recps, cb)
```

The content will be encrypted using the public keys passed into recps.
Limit 7 recipients.

 - `content` (object): The content of the message.
 - `recps` (array of feedids): The recipients of the message (limit 7).


## unbox: sync

Attempt to decrypt the content of an encrypted message.

```
*this can not be used from the commandline*
```

```js
unbox(ciphertext, cb)
```

 - `cyphertext` (string)