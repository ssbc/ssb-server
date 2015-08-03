
var SecretStack = require('secret-stack')
var create     = require('secure-scuttlebutt/create')
var ssbKeys    = require('ssb-keys')
var path       = require('path')
var osenv      = require('osenv')
var mkdirp     = require('mkdirp')
var rimraf     = require('rimraf')

function toBuffer(base64) {
  return new Buffer(base64.substring(0, base64.indexOf('.')), 'base64')
}

function toSodiumKeys (keys) {
  return {
    publicKey: toBuffer(keys.public),
    secretKey: toBuffer(keys.private)
  }
}

function isString(s) { return 'string' === typeof s }

function copy (o) {
  var O = {}
  for(var k in o)
    if(o[k] && 'object' !== typeof o[k]) O[k] = o[k]
  return O
}

var SSB = {
  manifest: {
    'add'             : 'async',
    'publish'         : 'async',
    'publishBoxed'    : 'async',

    'box'             : 'async',
    'unbox'           : 'async',

    'get'             : 'async',
    'getPublicKey'    : 'async',
    'getLatest'       : 'async',
    'whoami'          : 'async',
    'auth'            : 'async',
    'relatedMessages' : 'async',

    //local nodes
    'getLocal'    : 'async',

    'query'                  : 'source',
    'createFeedStream'       : 'source',
    'createHistoryStream'    : 'source',
    'createLogStream'        : 'source',
    'createUserStream'       : 'source',
    'links'                  : 'source',
    'messagesByType'         : 'source',
  },
  permissions: {
    master: {allow: null, deny: null},
    anonymous: {allow: ['createHistoryStream'], deny: null}
  },
  init: function (api, opts) {

    //useful for testing
    if(opts.temp) {
      var name = isString(opts.temp) ? opts.temp : ''+Date.now()
      opts.path = path.join(osenv.tmpdir(), name)
      rimraf.sync(opts.path)

      //load/create  secure scuttlebutt.
      mkdirp.sync(path.join(opts.path, 'db'))
    }

    if(!opts.keys)
      opts.keys = ssbKeys.generate('ed25519', opts.seed && new Buffer(opts.seed, 'base64'))

    if(!opts.path)
      throw new Error('opts.path *must* be provided, or use opts.temp=sname to create a test instance')

    var ssb = create(path.join(opts.path, 'db'), null, opts.keys)
    var feed = ssb.createFeed(opts.keys)
    return {
      id                       : feed.id,
      keys                     : opts.keys,
      publish                  : feed.add,

      add                      : ssb.add,
      get                      : ssb.get,

      pre                      : ssb.pre,
      post                     : ssb.post,

      getPublicKey             : ssb.getPublicKey,
      getLatest                : ssb.getLatest,
      whoami                   : function (cb) { cb(null, { id: feed.id }) },
      relatedMessages          : ssb.relatedMessages,
      query                    : ssb.query,
      createFeed               : ssb.createFeed,
      createFeedStream         : ssb.createFeedStream,
      createHistoryStream      : ssb.createHistoryStream,
      createLogStream          : ssb.createLogStream,
      createUserStream         : ssb.createUserStream,
      links                    : ssb.links,
      sublevel                 : ssb.sublevel,
      messagesByType           : ssb.messagesByType,
      createWriteStream        : ssb.createWriteStream,
      createLatestLookupStream : ssb.createLatestLookupStream,
    }
  }
}

module.exports = SecretStack({
  appKey: require('./lib/ssb-cap')
})
.use(SSB)

