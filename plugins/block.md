# scuttlebot block plugin

Disallow connections with people flagged by the local user, and avoid sending a feed to the users they've flag.


## isBlocked: sync

Is the target user blocked?

```bash
isBlocked {dest}
isBlocked --source {feedid} --dest {feedid}
```

```js
isBlocked(dest, cb)
isBlocked({ source:, dest: }, cb)
```

If `source` is not specified, defaults to the local user.