var pull      = require('pull-stream')
var pl        = require('pull-level')
var paramap   = require('pull-paramap')
var defer     = require('pull-defer')
var toPull    = require('stream-to-pull-stream')
var pathlib   = require('path')
var fs        = require('fs')
var explain   = require('explain-error')
var ref       = require('ssb-ref')
var mlib      = require('ssb-msgs')
var timestamp = require('monotonic-timestamp')
var multicb   = require('multicb')
var mime      = require('mime-types')

var HI = undefined, LO = null
var bundleNameRegex = /[a-z0-9][a-z0-9\-_.,()]*/i

module.exports = {
  name: 'bundles',
  version: '0.0.0',
  manifest: {
    get: 'async',
    getBlob: 'source',
    getBlobMeta: 'async',

    lookup: 'async',
    listRevisions: 'source',
    setForkAsDefault: 'async',

    checkout: 'async',
    checkoutBlob: 'async',

    listWorking: 'source',
    createWorking: 'async',
    updateWorking: 'async',
    publishWorking: 'async',
    removeWorking: 'async'
  },
  permissions: {
    anonymous: {},
  },
  init: init
}

function error (msg, attrs) {
  var err = new Error(msg)
  if (attrs) {
    for (var k in attrs)
      err[k] = attrs[k]
  }
  return err
}

// put the input into the regular form of '/foo/bar'
// eg 'foo' -> '/foo', './foo' -> '/foo'
function normalizePath (str) {
  if (str.charAt(0) == '.' && str.charAt(1) == '/')
    return str.slice(1)
  if (str.charAt(0) != '/')
    return '/' + str
  return str
}

// put the name in a regular form
function normalizeName (str) {
  if (str.charAt(0) == '/')
    str = str.slice(1)
  return str.toLowerCase()
}

// working id helpers
function makeWorkingid () {
  return 'working-' + timestamp()
}
function isWorkingid (str) {
  return /^working-/.test(str)
}

function init (sbot, opts) {
  var bundlesDB = sbot.sublevel('bundles')
  var namesDB   = bundlesDB.sublevel('names')
  var workingDB = bundlesDB.sublevel('working')

  /*
  The db KV model:
  - bundlesDB  hash: bundle                 -> published bundles
  - workingDB  wid: bundle                  -> working bundles
  - namesDB    name: hash|wid               -> maps default fork for name
  - bundlesDB  [name, hash|wid]: 1          -> forks/revisions for name
  - bundlesDB  [bundle.root, hash|wid]: 1   -> revisions for hash
  - bundlesDB  [bundle.branch, hash|wid]: 1 -> revisions for branch
  */

  // monitor the feed for bundles
  pull(
    sbot.messagesByType({ type: 'bundle', keys: true, values: true, live: true }),
    pull.drain(function (msg) {
      // create bundle object
      var c = msg.value.content
      var bundle = {
        id: msg.key,
        name: c.name,
        desc: c.desc,
        author: msg.value.author,
        timestamp: msg.value.timestamp,
        root: mlib.link(c.root, 'msg') ? mlib.link(c.root).link : null,
        branch: mlib.link(c.branch, 'msg') ? mlib.link(c.branch).link : null,
        blobs: {}
      }
      mlib.links(c.includes, 'blob').forEach(function (blob) {
        if (blob.path)
          bundle.blobs[normalizePath(blob.path)] = blob
      })
      if (!bundle.name || !bundleNameRegex.test(bundle.name))
        return sbot.emit('log:error', ['bundles', null, 'Invalid bundle message: name malformed', { msg: msg }])
      if (Object.keys(bundle.blobs).length === 0)
        return sbot.emit('log:error', ['bundles', null, 'Invalid bundle message: no blobs included', { msg: msg }])

      // write to database
      sbot.emit('bundles:got', bundle)
      sbot.emit('log:info', ['bundles', null, 'Processed new bundle for', bundle.name])
      var done = multicb()
      bundlesDB.put(bundle.id, bundle, done())
      bundlesDB.put([normalizeName(bundle.name), bundle.id], 1, done())
      if (bundle.root)
        bundlesDB.put([bundle.root, bundle.id], 1, done())
      if (bundle.branch && bundle.branch != bundle.root)
        bundlesDB.put([bundle.branch, bundle.id], 1, done())
      done(function (err) {
        if (err) sbot.emit('log:error', ['bundles', null, 'Failed to store bundle to database', { err: err, msg: msg }])
        else sbot.emit('bundles:processed', bundle)
      })
    })
  )

  return {
    // get the bundle for a given (bundleid)
    get: function (bundleid, cb) {
      if (ref.isMsgId(bundleid)) {
        // load the bundle from published
        bundlesDB.get(bundleid, function (err, bundle) {
          if (err)
            return cb(explain(err, 'Failed to load bundle'))
          cb(null, bundle)
        })
      } else if (isWorkingid(bundleid)) {
        // load the bundle from working
        workingDB.get(bundleid, function (err, bundle) {
          if (err)
            return cb(explain(err, 'Failed to load bundle'))
          cb(null, bundle)
        })
      } else
        return cb(error('Invalid bundle id', { invalidId: true }))
    },

    // get the blob for a given (bundleid, relpath) or (abspath)
    // - latter case involves a lookup for the default fork for a given name
    getBlob: function (bundleid, relpath) {
      var stream = defer.source()

      // handle (abspath) signature
      if (typeof relpath == 'undefined') {
        relpath = null
        sbot.bundles.getBlobMeta(bundleid, next)
      } else
        sbot.bundles.getBlobMeta(bundleid, relpath, next)

      function next (err, meta) {
        if (err) return stream.abort(err)
        if (meta.link) {
          // published bundle, read the blob
          stream.resolve(sbot.blobs.get(meta.link))
        } else {
          // working bundle, read the file
          stream.resolve(toPull.source(fs.createReadStream(meta.path)))
        }
      }
      return stream
    },

    // get the metadata of a blob for a given (bundleid, relpath) or (abspath)
    // - latter case involves a lookup for the default fork for a given name
    getBlobMeta: function (bundleid, relpath, cb) {
      var abspath
      // handle (abspath, cb) signature
      if (typeof relpath == 'function') {
        cb      = relpath
        abspath = bundleid
        relpath = bundleid = null

        // go from abspath -> (bundleid,relpath)
        var abspathNoSlash = abspath.charAt(0) == '/' ? abspath.slice(1) : abspath
        if (isWorkingid(abspathNoSlash)) {
          // working bundle path
          var parts = abspathNoSlash.split('/')
          next(parts[0], parts.slice(1).join('/'))
        } else if (abspathNoSlash.charAt(0) == '%') {
          // published bundle path
          var parts = /(%.*\.sha256)(.*)/i.exec(abspathNoSlash)
          if (!parts || !ref.isMsgId(parts[1]))
            return cb(error('Invalid path', { invalidPath: true }))
          next(parts[1], parts[2])
        } else {
          // named path, eg '/foo/bar'
          sbot.bundles.lookup(abspath, function (err, bundleid) {
            if (err)
              return cb(explain(err, 'Failed to lookup bundle'))

            // extract the relpath
            // eg /foo/bar -> /bar
            relpath = '/' + (abspathNoSlash.split('/').slice(1).join('/'))
            next(bundleid, relpath)
          })
        }
      } else next(bundleid, relpath)
      function next (bundleid, relpath) {
        var isAutoIndex = false
        if (!relpath || relpath == '/') {
          relpath = '/index.html'
          isAutoIndex = true
        }

        // get bundle
        sbot.bundles.get(bundleid, function (err, bundle) {
          if (err) return cb(err)

          if (ref.isMsgId(bundleid)) {
            // published bundle, lookup the blob
            var blob = bundle.blobs[normalizePath(relpath)]
            if (!blob)
              return cb(error('File not found', { notFound: true }))
            blob.isAutoIndex = isAutoIndex
            cb(null, blob)
          } else {
            // working bundle, read from disk
            var filepath = pathlib.join(bundle.dirpath, normalizePath(relpath))
            fs.stat(filepath, function (err, stat) {
              if (err)
                return cb(explain(err, 'Failed to stat file'))
              stat.path = filepath
              stat.type = mime.lookup(filepath)
              stat.isAutoIndex = isAutoIndex
              cb(null, stat)
            })
          }
        })
      }
    },

    // get the bundle currently mapped to a given location
    lookup: function (abspath, cb) {
      // extract the name
      // eg /foo/bar -> foo
      abspath = normalizePath(abspath)
      var parts = abspath.split('/')
      var name  = parts[1]
      if (!name)
        return cb(error('Invalid path', { invalidPath: true }))

      // check the database
      namesDB.get(normalizeName(name), function (err, bundleid) {
        if (err && !err.notFound)
          return cb(explain(err, 'Failed to lookup name mapping'))
        cb(null, bundleid)
      })
    },

    // get all of the forks of a given (name or bundleid)
    listRevisions: function (nameOrBundleid) {
      if (!isWorkingid(nameOrBundleid) && !ref.isMsgId(nameOrBundleid))
        nameOrBundleid = normalizeName(nameOrBundleid)
      return pull(
        // read the index
        pl.read(bundlesDB, {
          gte:    [nameOrBundleid, LO],
          lte:    [nameOrBundleid, HI],
          values: false
        }),
        paramap(function (key, cb) {
          var bundleid = key[1]
          if (ref.isMsgId(bundleid)) {
            // fetch published bundle
            bundlesDB.get(bundleid, cb)
          } else if (isWorkingid(bundleid)) {
            // fetch working bundle
            workingDB.get(bundleid, cb)
          } else
            cb(error('Invalid bundle id in index', { bundleid: bundleid, invalidId: true }))
        })
      )
    },

    // set the bundle as the default for its name
    setForkAsDefault: function (bundleid, cb) {
      // get the bundle
      sbot.bundles.get(bundleid, function (err, bundle) {
        if (err)
          return cb(err)
        if (!bundle.name)
          return cb(error('Invalid bundle: no name is provided', { invalidBundle: true }))
        if (!bundleNameRegex.test(bundle.name))
          return cb(error('Invalid bundle: name includes invalid characters', { invalidBundle: true }))

        // write the mapping
        namesDB.put(normalizeName(bundle.name), bundleid, function (err) {
          if (err)
            return cb(explain(err, 'Failed to write the new name->fork mapping'))
          cb()
        })
      })
    },

    // copy a bundle's files into the given directory
    checkout: function (bundleid, dirpath, cb) {
      // get bundle
      sbot.bundles.get(bundleid, function (err, bundle) {
        if (err) return cb(err)

        // iterate blobs, construct filepath, pipe from blobstore into filepath
        if (!bundle.blobs)
          return cb()

        var done = multicb()
        for (var relpath in bundle.blobs)
          sbot.bundles.checkoutBlob(bundleid, relpath, pathlib.join(dirpath, relpath), done())
        done(cb)
      })
    },

    // copy a file from a bundle into the given directory
    checkoutBlob: function (bundleid, relpath, filepath, cb) {
      var abspath
      // handle (abspath, filepath, cb) signature
      if (typeof filepath == 'function') {
        cb       = filepath
        filepath = relpath
        abspath  = bundleid
        relpath  = bundleid = null

        sbot.bundles.getBlobMeta(abspath, next)
      } else
        sbot.bundles.getBlobMeta(bundleid, relpath, next)

      function next (err, meta) {
        if (err) return stream.abort(err)
        pull(
          (meta.link) ?
            sbot.blobs.get(meta.link) : // published bundle, read the blob
            toPull.source(fs.createReadStream(meta.filepath)), // working bundle, read the file
          toPull.sink(fs.createWriteStream(filepath), cb)
        )
      }
    },

    // list all working bundles
    listWorking: function (cb) {
      return pl.read(workingDB, { keys: false })
    },

    // create a new working bundle
    // - opts.dirpath: required string
    // - opts.name: required string
    // - opts.desc: require string
    // - opts.root: optional msghash
    // - opts.branch: optional msghash
    createWorking: function (opts, cb) {
      if (!opts || !opts.name || !bundleNameRegex.test(opts.name))
        return cb(error('Invalid name', { invalidName: true }))
      if (!opts.desc || typeof opts.desc != 'string')
        return cb(error('Invalid desc', { invalidDesc: true }))
      if (!opts.dirpath || typeof opts.dirpath != 'string')
        return cb(error('Invalid directory path', { invalidDirpath: true }))
      if (opts.root && !ref.isMsgId(opts.root))
        return cb(error('Invalid root hash', { invalidRoot: true }))
      if (opts.branch && !ref.isMsgId(opts.branch))
        return cb(error('Invalid branch hash', { invalidBranch: true }))

      // add working bundle to db
      var bundle = {
        id: makeWorkingid(),
        name: opts.name,
        desc: opts.desc,
        root: opts.root,
        branch: opts.branch,
        dirpath: opts.dirpath
      }
      var done = multicb()
      workingDB.put(bundle.id, bundle, done())
      bundlesDB.put([normalizeName(bundle.name), bundle.id], 1, done())
      if (bundle.root)
        bundlesDB.put([bundle.root, bundle.id], 1, done())
      if (bundle.branch)
        bundlesDB.put([bundle.branch, bundle.id], 1, done())
      done(function (err) {
        if (err) return cb(explain(err, 'Failed to update working bundles database'))
        cb(null, bundle)

        // set as default if there's not already a fork for the given name
        // :WARNING: this is not a safe transaction- the default fork could be set between `lookup` and `setForkAsDefault`
        sbot.bundles.lookup(bundle.name, function (err, b) {
          if (!b)
            sbot.bundles.setForkAsDefault(bundle.id, function(){})
        })
      })
    },

    // update a working bundle
    // - opts.dirpath: optional string
    updateWorking: function (bundleid, opts, cb) {
      if (!isWorkingid(bundleid))
        return cb(error('Invalid bundle id', { invalidId: true }))

      // load the working bundle
      sbot.bundles.get(bundleid, function (err, bundle) {
        if (err)
          return cb(explain(err, 'Failed to load bundle from database'))

        // apply updates
        if (opts && opts.dirpath)
          bundle.dirpath = opts.dirpath

        // write to db
        workingDB.put(bundle.id, bundle, cb)
      })
    },

    // publish a working bundle
    // - files: array of absolute filepaths to include in the bundle
    publishWorking: function (bundleid, files, cb) {
      if (!isWorkingid(bundleid))
        return cb(error('Invalid bundle id', { invalidId: true }))
      if (!Array.isArray(files))
        return cb(error('Files array is required', { invalidFiles: true }))

      // load the working bundle
      sbot.bundles.get(bundleid, function (err, bundle) {
        if (err)
          return cb(explain(err, 'Failed to load bundle from database'))

        // add each of the files to the blobstore
        var done = multicb({ pluck: 1 })
        files.forEach(function (filepath) {
          var cb2 = done()

          // construct relpath
          var relpath = pathlib.relative(bundle.dirpath, filepath)
          if (relpath.indexOf('..') >= 0)
            return cb2(error('All files must be a child of the working directory', { invalidFile: true, file: filepath }))

          // add to blobstore
          pull(
            toPull.source(fs.createReadStream(filepath)),
            sbot.blobs.add(function (err, hash) {
              if (err)
                cb2(err)
              else {
                var ext = pathlib.extname(filepath)
                cb2(null, { link: hash, path: normalizePath(relpath), type: mime.lookup(ext) })
              }
            })
          )
        })
        done(function (err, blobs) {
          if (err)
            return cb(err)

          // publish the bundle message
          var msg = {
            type: 'bundle',
            name: bundle.name,
            desc: bundle.desc,
            includes: blobs
          }
          if (bundle.root) msg.root = { link: bundle.root }
          if (bundle.branch) msg.branch = { link: bundle.branch }
          sbot.publish(msg, function (err, publishedMsg) {
            if (err) return cb(explain(err, 'Failed to publish bundle message'))

            // update the working bundle
            bundle.root = bundle.root || publishedMsg.key
            bundle.branch = publishedMsg.key
            workingDB.put(bundle.id, bundle, function (err) {
              if (err) return cb(explain(err, 'Failed to update working bundle'))
              cb(null, publishedMsg)
            })
          })
        })
      })
    },

    // remove a working bundle
    removeWorking: function (bundleid, cb) {
      if (!isWorkingid(bundleid))
        return cb(error('Invalid bundle id', { invalidId: true }))
      sbot.bundles.get(bundleid, function (err, bundle) {
        if (err) return cb(explain(err, 'Failed to get bundle for removal'))

        // remove DB entries
        var done = multicb({ pluck: 1 })
        workingDB.del(bundleid, done())
        bundlesDB.del([bundle.name, bundleid], done())
        if (bundle.root) bundlesDB.del([bundle.root, bundleid], done())
        if (bundle.branch) bundlesDB.del([bundle.branch, bundleid], done())
        var nameMappingCB = done()
        done(cb)

        // remove from default
        // :WARNING: this is not a safe transaction- the default fork could be set between `lookup` and `setForkAsDefault`
        sbot.bundles.lookup(bundle.name, function (err, b) {
          if (b && b == bundleid)
            namesDB.del(normalizeName(bundle.name), nameMappingCB)
          else
            nameMappingCB()
        })
      })
    }
  }
}
