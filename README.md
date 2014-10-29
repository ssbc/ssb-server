# Scuttlebot

A bot-server for the phoenix network. Provides an HTTP server alongside its SSB server for custom endpoints and interfaces. Can be `require()`ed to create your own bots.

Usage:

```
./scuttlebot serve --port 2000 --ssbport 2001
```

API:

```js
var sbot = require('scuttlebot')
var ssbapi = require('secure-scuttlebutt/api')

// with the default api:
var server = sbot.serve(2000)
var client = sbot.connect(2000, 'localhost')
client.getPublicKey(function(err, key) {
  // ...
})

// with a custom API:
var server = sbot.serve(2000, function(backend) {
  // return your muxrpc server
  return ssbapi.server(backend.ssb, backend.feed)
})
var client = sbot.connect(2000, 'localhost', ssbapi.client())
client.getPublicKey(function(err, key) {
  // ...
})
```