# scuttlebot invite plugin

Invite-token system, mainly used for pubs.


## create: async

Create a new invite code.

```bash
create {n}
```

```js
create(n, cb)
```

This produces an invite-code which encodes the sbot server's address, and a keypair seed.
The keypair seed is used to generate a keypair, which is then used to authenticate a connection with the sbot server.
The sbot server will then grant access to the `use` call.

- `n` (number): How many times the invite can be used before it expires.



## accept: async

Use an invite code.

```bash
accept {invitecode}
```

```js
accept(invitecode, cb)
```

This connects to the server address encoded in the invite-code, then calls `use()` on the server.
It will cause the server to follow the local user.

 - invitecode (string)


## use: async

Use an invite code created by this sbot instance (advanced function).

```bash
use --feed {feedid}
```

```js
use({ feed: }, cb)
```

This commands the receiving server to follow the given feed.

An invite-code encodes the sbot server's address, and a keypair seed.
The keypair seed must be used to generate a keypair, then authenticate a connection with the sbot server, in order to use this function.

 - `feed` (feedid): The feed the server should follow.

