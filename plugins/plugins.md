# scuttlebot plugins plugin

Install and manage third-party plugins.



## install: source

Install a plugin to Scuttlebot.

```bash
install {nodeModule} [--from path]
```
```js
install(nodeModule, { from: })
```

Calls out to npm to install a package into `~/.ssb/node_modules`.

 - nodeModule (string): The name of the plugin to install. Uses npm's module package-name rules.
 - from (string): A location to install from (directory path, url, or any location that npm accepts for its install command).



## uninstall: source

Uninstall a plugin from Scuttlebot.

```bash
uninstall {nodeModule}
```
```js
uninstall(nodeModule)
```

Calls out to npm to uninstall a package into `~/.ssb/node_modules`.

 - nodeModule (string): The name of the plugin to uninstall.



## enable: async

Update the config to enable a plugin.

```bash
enable {nodeModule}
```
```js
enable(nodeModule, cb)
```

 - nodeModule (string): The name of the plugin to enable.



## disable: async

Update the config to disable a plugin.

```bash
disable {nodeModule}
```
```js
disable(nodeModule, cb)
```

 - nodeModule (string): The name of the plugin to disable.