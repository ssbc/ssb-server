'use strict'

var Blobs  = require('multiblob')
var path   = require('path')
var pull   = require('pull-stream')
var isBlob = require('ssb-ref').isBlobId
var Quota  = require('./quota')
var Notify = require('pull-notify')
var mdm    = require('mdmanifest')
var valid  = require('../../lib/validators')
var apidoc = require('../../lib/apidocs').blobs
var Replicate = require('./replication')

var mbu = require('multiblob/util')

// blobs plugin
// methods to read/write the blobstore
// and automated blob-fetching from the network

function isFunction (f) {
  return 'function' === typeof f
}

function _desigil (hash) {
  return isBlob(hash) ? hash.substring(1) : hash
}

function _resigil (hash) {
  return isBlob(hash) ? hash : '&'+hash
}

function isString (s) {
  return 'string' === typeof s
}

//desigil = _desigil
//
//resigil = _resigil


module.exports = {
  name: 'blobs',
  version: '0.0.0',
  manifest: mdm.manifest(apidoc),
  permissions: {
    anonymous: {allow: ['has', 'get', 'changes']},
  },
  init: function (sbot, opts) {

    var notify = Notify()
    var config = opts

    var blobs = sbot._blobs = Blobs({
      dir: path.join(config.path, 'blobs'),
      hash: 'sha256',
      encode: function (buf, alg) {
        return _resigil(mbu.encode(buf, alg))
      },
      decode: function (str) {
        return mbu.decode(_desigil(str))
      },
      isHash: isBlob
    })

    var userQuotas = {} // map of { feedId => quotaUsage }, for rate-limiting
    var drain = Quota(sbot, blobs, userQuotas)
    var wantList = Replicate(sbot, config, notify, userQuotas)

    return {
      get: valid.source(blobs.get, 'blobId'),

      has: valid.async(function (hash, cb) {
        //emit blobs:has event when this api is called remotely.
        //needed to make tests pass. should probably remove this.
        if(this.id) sbot.emit('blobs:has', hash)
        blobs.has(hash, cb)
      }, 'blobId|array'),

      size: valid.async(blobs.size, 'blobId|array'),

      add: valid.sink(function (hash, cb) {
        // cb once blob is successfully added.
        // sink cbs are not exposed over rpc
        // so this is only available when using this api 
        if(isFunction(hash)) cb = hash, hash = null

        return blobs.add(hash, function (err, hash) {
          if(!err) {
            sbot.emit('blobs:got', hash)
            notify(hash)
            //wait until quotas have been calculated
            //befor returning (tests will fail without this)
            if(cb) drain(function () {
              cb(null, hash)
            })
          }
          else {
            if(cb) cb(err, hash)
            else   console.error(err.stack)
          }
        })
      }, 'string?'),

      rm: valid.async(blobs.rm, 'string'),

      ls: blobs.ls,
      // request to retrieve a blob,
      // calls back when that file is available.
      // - `opts.nowait`: call cb immediately if not found (dont register for callback)
      want: valid.async(function (hash, opts, cb) {
        if (isFunction(opts)) {
          cb = opts
          opts = null
        }
        var id = this.id
        if(!isBlob(hash)) return cb(new Error('not a hash:' + hash))

        sbot.emit('blobs:wants', hash)
        blobs.has(hash, function (_, has) {
          if (has) return cb(null, true)
          // update queue
          wantList.want(hash, id, cb)
        })
      }, 'blobId', 'object?'),

      changes: notify.listen,

      quota: valid.sync(function (id) {
        return wantList.quota(id)
      }, 'feedId'),

      // get current want list
      wants: function () {
        return wantList.jobs
      }
    }
  }
}








