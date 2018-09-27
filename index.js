var SecretStack = require('secret-stack')
var create     = require('secure-scuttlebutt/create')
var ssbKeys    = require('ssb-keys')
var path       = require('path')
var osenv      = require('osenv')
var mkdirp     = require('mkdirp')
var rimraf     = require('rimraf')
var mdm        = require('mdmanifest')
var cmdAliases = require('./lib/cli-cmd-aliases')
var valid      = require('./lib/validators')
var apidocs    = require('./lib/apidocs.js')
var pkg        = require('./package.json')

function isString(s) { return 'string' === typeof s }
function isObject(o) { return 'object' === typeof o }
function isFunction (f) { return 'function' === typeof f }
// create SecretStack definition
var manifest = mdm.manifest(apidocs._)
manifest.seq = 'async'
manifest.usage = 'sync'
manifest.clock = 'async'
manifest.version = 'sync'

var SSB = {
  manifest: manifest,
  permissions: {
    master: {allow: null, deny: null},
    anonymous: {allow: ['createHistoryStream'], deny: null}
  },
  init: function (api, opts) {

    // .temp: use a /tmp data directory
    // (useful for testing)
    if(opts.temp) {
      var name = isString(opts.temp) ? opts.temp : ''+Date.now()
      opts.path = path.join(osenv.tmpdir(), name)
      rimraf.sync(opts.path)
    }

    // load/create secure scuttlebutt data directory
    var dbPath = path.join(opts.path, 'db')
    mkdirp.sync(dbPath)

    if(!opts.keys)
      opts.keys = ssbKeys.generate('ed25519', opts.seed && new Buffer(opts.seed, 'base64'))

    if(!opts.path)
      throw new Error('opts.path *must* be provided, or use opts.temp=name to create a test instance')

    var mappers = []

    var mapChain = (val, cb) => {
      let idx = 0
      const chainNext = (err, val) => {
        if (err) cb(err)

        if (idx <= mappers.length - 1) {
          idx += 1
          mappers[idx - 1](val, chainNext)
        } else {
          cb(err, val)
        }
      }

      chainNext(null, val)
    }

    if(!opts.map)
      opts.map = (val, cb) => {
        if (!mappers.length) return cb(null, val)

        mapChain(val, cb)
      }


    // main interface
    var ssb = create(path.join(opts.path, 'db'), opts, opts.keys)
    //treat the main feed as remote, because it's likely handled like that by others.
    var feed = ssb.createFeed(opts.keys, {remote: true})
    var _close = api.close
    var close = function (arg, cb) {
      if('function' === typeof arg) cb = arg
      // override to close the SSB database
      ssb.close(function (err) {
        if (err) throw err
        _close()
        cb && cb() //multiserver doesn't take a callback on close.
      })
    }

    function since () {
      var plugs = {}
      var sync = true
      for(var k in ssb) {
        if(ssb[k] && isObject(ssb[k]) && isFunction(ssb[k].since)) {
          plugs[k] = ssb[k].since.value
          sync = sync && (plugs[k] === ssb.since.value)
        }
      }
      return {
        since: ssb.since.value,
        plugins: plugs,
        sync: sync,
      }
    }
    var self
    return self = {
      id                       : feed.id,
      keys                     : opts.keys,

      ready                    : function () {
        return ssb.ready.value
      },

      progress                 : function () {
        return ssb.progress
      },

      status                   : function () {
        return {progress: self.progress(), db: ssb.status, sync: since() }
      },

      version                  : function () {
        return pkg.version
      },

      //temporary!
      _flumeUse                :
        function (name, flumeview) {
          ssb.use(name, flumeview)
          return ssb[name]
        },

      usage                    : valid.sync(usage, 'string?|boolean?'),
      close                    : valid.async(close),

      publish                  : valid.async(feed.add, 'string|msgContent'),
      add                      : valid.async(ssb.add, 'msg'),
      queue                      : valid.async(ssb.queue, 'msg'),
      get                      : valid.async(ssb.get, 'msgLink|number|object'),

      post                     : ssb.post,

      since                    : since,

      getPublicKey             : ssb.getPublicKey,
      latest                   : ssb.latest,
      getLatest                : valid.async(ssb.getLatest, 'feedId'),
      latestSequence           : valid.async(ssb.latestSequence, 'feedId'),
      createFeed               : ssb.createFeed,
      whoami                   : function () { return { id: feed.id } },
      query                    : ssb.query,
      createFeedStream         : valid.source(ssb.createFeedStream, 'readStreamOpts?'),
      createHistoryStream      : valid.source(ssb.createHistoryStream, ['createHistoryStreamOpts'], ['feedId', 'number?', 'boolean?']),
      createLogStream          : valid.source(ssb.createLogStream, 'readStreamOpts?'),
      createUserStream         : valid.source(ssb.createUserStream, 'createUserStreamOpts'),
      links                    : valid.source(ssb.links, 'linksOpts'),
      sublevel                 : ssb.sublevel,
      messagesByType           : valid.source(ssb.messagesByType, 'string|messagesByTypeOpts'),
      createWriteStream        : ssb.createWriteStream,
      getVectorClock           : ssb.getVectorClock,
      getAtSequence            : ssb.getAtSequence,
      addUnboxer               : ssb.addUnboxer,
      addMap                    : function(fn) {
        mappers.push(fn)
      }
    }
  }
}

// live help RPC method
function usage (cmd) {
  var path = (cmd||'').split('.')
  if ((path[0] && apidocs[path[0]]) || (cmd && apidocs[cmd])) {
    // return usage for the plugin
    cmd = path.slice(1).join('.')
    return mdm.usage(apidocs[path[0]], cmd, { prefix: path[0] })
  }
  if (!cmd) {
    // return usage for all docs
    return Object.keys(apidocs).map(function (name) {
      if (name == '_')
        return mdm.usage(apidocs[name], null, { nameWidth: 20 })

      var text = mdm.usage(apidocs[name], null, { prefix: name, nameWidth: 20 })
      return text.slice(text.indexOf('Commands:') + 10) // skip past the toplevel summary, straight to the cmd list
    }).join('\n\n')
  }
  // toplevel cmd usage
  cmd = cmdAliases[cmd] || cmd
  return mdm.usage(apidocs._, cmd)
}

function createSbot() {
  return SecretStack({
    //this is just the default app key.
    //it can be overridden by passing a appKey as option
    //when creating a Sbot instance.
    appKey: require('./lib/ssb-cap')
  })
    .use(SSB)
    .use(function (ssk, config) {
      var Onion = require('multiserver/plugins/onion')

      ssk.multiserver.transport({
        name: 'onion',
        create: function (conf) {
          return Onion(conf)
        }
      })
    })
    .use(function (ssk, config) {
      var WS = require('multiserver/plugins/ws')

      ssk.multiserver.transport({
        name: 'ws',
        create: function (conf) {
          if (!conf.port)
            conf.port = 1024+(~~(Math.random()*(65536-1024)))

          return WS(conf)
        }
      })
    })
    .use(function (ssk, config) {
      var Unix = require('multiserver/plugins/unix-socket')
      ssk.multiserver.transport({
        name: 'unix',
        create: function (conf) {
          return Unix(config)
        }
      })
    })
    .use(function (ssk, config) {
      var Noauth = require('multiserver/plugins/noauth')

      ssk.multiserver.transform({
        name: 'noauth',
        create: function () {
          return Noauth({
            keys: {
              publicKey: Buffer.from(config.keys.public, 'base64')
            }
          })
        }
      })
    })
    .use(function (ssk, config) { 
      var console = require('console')
      var pull = require('pull-stream')
      var Blobs = require('multiblob')

      function isBlobString (s) {
        return isString(s) && 0 === s.indexOf('&');
      }
      function isBlobContent (c) {
        return 'object' === typeof c &&'blob' === c.type && isBlobString(c.blob);
      }
      function getBlobHash (x) {
        return x.slice(1)
      }

      var blobs = Blobs({
        dir: path.join(config.path, 'blobs'),
        alg: 'sha256'
      })

      ssk.addMap((val, cb) => {
        if (!isBlobContent(val.value.content)) return cb(null, val)

        pull(
          blobs.get(getBlobHash(val.value.content.blob)),
          pull.collect(function (err, bufs) {
            if (err) {
              console.warn(
                `Key: ${val.key}`,
                `Blob: ${val.value.content.blob}`,
                err
              )
              cb(null, val)
            } else {
              try {
                var contentString = Buffer.concat(bufs)
                var blobContent = JSON.parse(contentString)
                val.value.blob = val.value.content.blob
                val.value.content = blobContent
                val.value.blobContent = true
              } catch(e) {
                console.warn(
                  `Key: ${val.key}`,
                  `Blob: ${val.value.content.blob}`,
                  `Content: ${contentString}`,
                  e
                )
              }
              cb(null, val)
            }
          })
        )
      })
    })
}
module.exports = createSbot()
module.exports.createSbot = createSbot


