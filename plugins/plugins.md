# scuttlebot plugins plugin

Install and manage third-party plugins.



## install: async

Install a plugin to Scuttlebot.

```bash
install {nodeModule}
```
```js
install(nodeModule, cb)
```

Calls out to npm to install a package into `~/.ssb/node_modules`.

 - nodeModule (string): The name of the plugin to install. Users npm's module package-name rules.