# scuttlebot plugins plugin

Install and manage third-party plugins.



## install: source

Install a plugin to Scuttlebot.

```bash
install {nodeModule}
```
```js
install(nodeModule, cb)
```

Calls out to npm to install a package into `~/.ssb/node_modules`.

 - nodeModule (string): The name of the plugin to install. Uses npm's module package-name rules.



## uninstall: source

Uninstall a plugin from Scuttlebot.

```bash
uninstall {nodeModule}
```
```js
uninstall(nodeModule, cb)
```

Calls out to npm to uninstall a package into `~/.ssb/node_modules`.

 - nodeModule (string): The name of the plugin to uninstall.