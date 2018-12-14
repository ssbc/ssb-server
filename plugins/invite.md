# ssb-server invite plugin

Invite-token system, mainly used for pubs.


## create: async

Create a new invite code.

```bash
create {n} [{note}, {external}]
```

```js
create(n[, note, external], cb)
```

This produces an invite-code which encodes the ssb-server instance's public address, and a keypair seed.
The keypair seed is used to generate a keypair, which is then used to authenticate a connection with the ssb-server instance.
The ssb-server instance will then grant access to the `use` call.

- `n` (number): How many times the invite can be used before it expires.
- `note` (string): A note to associate with the invite code. The ssb-server instance will
    include this note in the follow message that it creates when `use` is
    called.
- `external` (string): An external hostname to use


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

Use an invite code created by this ssb-server instance (advanced function).

```bash
use --feed {feedid}
```

```js
use({ feed: }, cb)
```

This commands the receiving server to follow the given feed.

An invite-code encodes the ssb-server instance's address, and a keypair seed.
The keypair seed must be used to generate a keypair, then authenticate a connection with the ssb-server instance, in order to use this function.

 - `feed` (feedid): The feed the server should follow.

