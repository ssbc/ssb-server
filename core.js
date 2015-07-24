
var Illuminati = require('illuminati')
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
    'links'                  : 'source',
    'messagesByType'         : 'source'
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

    if(!opts.path)
      throw new Error('opts.path *must* be provided, or use opts.temp=sname to create a test instance')

    var ssb = create(opts.path, null, opts.keys)
    var feed = ssb.createFeed(opts.keys)
    return {
      id                   : feed.id,
      publish              : feed.add,
      add                  : ssb.add,
      get                  : ssb.get,
      getPublicKey         : ssb.getPublicKey,
      getLatest            : ssb.getLatest,
      relatedMessages      : ssb.relatedMessages,
      query                : ssb.query,
      createFeedStream     : ssb.createFeedStream,
      createHistoryStream  : ssb.createHistoryStream,
      createLogStream      : ssb.createLogStream,
      links                : ssb.links,
      messagesByType       : ssb.messagesByType
    }
  }
}

module.exports = Illuminati({
  appKey: require('./lib/ssb-cap')
})
.use(SSB)
//.use(require('./plugins/logging'))

//var Scuttlebot = function (opts) {
//  if(!opts.keys) {
//    var keyPath = path.join(opts.path, 'secret')
//    opts.keys = ssbKeys.loadOrCreateSync(keyPath)
//  }
//
//  opts._keys = opts.keys
//  opts.keys = toSodiumKeys(opts.keys)
//
//  return createSbot(opts)
//}
//
//if(!module.parent)
//  Scuttlebot(require('ssb-config'))
//
