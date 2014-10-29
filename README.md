# Scuttlebot

A bot-server for the phoenix network. Provides an HTTP server alongside its SSB server for custom endpoints and interfaces. Can be `require()`ed to create your own bots.

Usage:

```
./scuttlebot serve --httpport 8000 --ssbport 8001
```

API:

```js
var sbot = require('scuttlebot')

sbot.createServers({ httpport: 8000, ssbport: 8001 }, function(req, res) {
  // your custom HTTP server
  res.writeHead(200).end('Scuttlebot!')
})
```