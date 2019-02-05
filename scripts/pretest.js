#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const semver = require('semver')
const debug = require('debug')('ssb-server:pretest')
var install = require('npm-install-package')

// polyfill!
if (!Object.entries) {
  Object.entries = function( obj ){
    var ownProps = Object.keys( obj ),
        i = ownProps.length,
        resArray = new Array(i); // preallocate the Array
    while (i--)
      resArray[i] = [ownProps[i], obj[ownProps[i]]];
    
    return resArray;
  };
}

debug.enabled = true

if (process.env.NODE_ENV != 'production') {
  const plugins = [
    'ssb-gossip',
    'ssb-blobs',
    'ssb-invite',
    'ssb-replicate',
    'ssb-ebt'
  ]


  // get dependencies from ssb-server
  const fullPath = path.join(__dirname, '..', 'package.json')
  debug('getting dependencies from %s', fullPath)
  const package = JSON.parse(fs.readFileSync(fullPath))
  const parent = {}
  Object.entries(package.dependencies).forEach(e => parent[e[0]] = e[1])
  Object.entries(package.devDependencies).forEach(e => parent[e[0]] = e[1])

  // initialize empty array for new deps needed
  const needDeps = []

  // get dependencies from plugin directories
  plugins.forEach(plugin => {
    const fullPath = path.join(__dirname, '..', 'node_modules', plugin, 'package.json')
    debug('getting dependencies from %s', fullPath)
    const package = JSON.parse(fs.readFileSync(fullPath))
    const pluginDeps = {}
    Object.entries(package.devDependencies).forEach(e => pluginDeps[e[0]] = e[1])

    Object.entries(pluginDeps).forEach(e => {
      const [ k, v ] = e

      if (Object.keys(parent).includes(k) === false || semver.intersects(parent[k], v) === false) {
        if (k !== 'ssb-server' ) {
          if (needDeps[k] == null) {
            debug('new dependency from %s: %o', plugin, { name: k, range: v })
            needDeps[k] = v
          } else {
            const pairs = [
              [needDeps[k], v],
              [parent[k], v]
            ]

            pairs.forEach(pair => {
              if (semver.intersects(pair[0], pair[1]) === false) {
                throw new Error('plugins have incompatible devDependencies')
              }
            })
          }
        }
      }
    })
  })

  const devDeps = Object.entries(needDeps).map(e => [e[0], e[1]].join('@'))

  if (devDeps.length > 0) {
    debug('installing: %O', devDeps)
    var opts = { saveDev: true, cache: true }

    debug.enabled = true
    debug('installing new plugin devDependencies')
    install(devDeps, opts, function (err) {
      if (err) throw err
      // avoid tests passing via Travis CI if dependencies are out-of-date
      debug('done! please re-run tests with these new dependencies')
      process.exit(1)
    })


  } else {
    debug('plugin devDeps look great!')
  }
}

