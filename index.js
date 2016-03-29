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

function isString(s) { return 'string' === typeof s }

// create SecretStack definition
var manifest = mdm.manifest(apidocs._)
manifest.usage = 'sync'
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

    // main interface
    var ssb = create(path.join(opts.path, 'db'), null, opts.keys)
    var feed = ssb.createFeed(opts.keys)
    var _close = api.close
    var close = function (cb) {
      // override to close the SSB database
      ssb.close(function (err) {
        if (err) throw err
        _close(cb)
      })
    }
    return {
      id                       : feed.id,
      keys                     : opts.keys,

      usage                    : valid.sync(usage, 'string?|boolean?'),
      close                    : valid.async(close),

      publish                  : valid.async(feed.add, 'string|msgContent'),
      add                      : valid.async(ssb.add, 'msg'),
      get                      : valid.async(ssb.get, 'msgId'),

      pre                      : ssb.pre,
      post                     : ssb.post,

      getPublicKey             : ssb.getPublicKey,
      latest                   : ssb.latest,
      getLatest                : valid.async(ssb.getLatest, 'feedId'),
      latestSequence           : valid.async(ssb.latestSequence, 'feedId'),
      createFeed               : ssb.createFeed,
      whoami                   : function () { return { id: feed.id } },
      relatedMessages          : valid.async(ssb.relatedMessages, 'relatedMessagesOpts'),
      query                    : ssb.query,
      createFeedStream         : valid.source(ssb.createFeedStream, 'readStreamOpts?'),
      createHistoryStream      : valid.source(ssb.createHistoryStream, ['createHistoryStreamOpts'], ['feedId', 'number?', 'boolean?']),
      createLogStream          : valid.source(ssb.createLogStream, 'readStreamOpts?'),
      createUserStream         : valid.source(ssb.createUserStream, 'createUserStreamOpts'),
      links                    : valid.source(ssb.links, 'linksOpts'),
      sublevel                 : ssb.sublevel,
      messagesByType           : valid.source(ssb.messagesByType, 'string|messagesByTypeOpts'),
      createWriteStream        : ssb.createWriteStream,
//      createLatestLookupStream : ssb.createLatestLookupStream,
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

module.exports = SecretStack({
  appKey: require('./lib/ssb-cap')
})
.use(SSB)

