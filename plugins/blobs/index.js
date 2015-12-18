'use strict'

var Blobs = require('multiblob')
var path = require('path')
var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var isBlob = require('ssb-ref').isBlobId
var paramap = require('pull-paramap')
var Quota = require('./quota')

var Notify = require('pull-notify')
var mdm = require('mdmanifest')
var valid = require('../../lib/validators')
var apidoc = require('../../lib/apidocs').blobs

var Replicate = require('./replication')

function id (e) {
  return !!e
}

function isFunction (f) {
  return 'function' === typeof f
}

function desigil (hash) {
  return isBlob(hash) ? hash.substring(1) : hash
}

function resigil (hash) {
  return isBlob(hash) ? hash : '&'+hash
}

function isString (s) {
  return 'string' === typeof s
}

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
      hash: 'sha256'
    })

    var quota = {}
    //pass drain a function and it calls back once
    //quotas are recalculated. see `add` below.
    var drain = Quota(sbot, blobs, quota)

    var wantList = Replicate(sbot, config, notify, quota)

    return {
      get: valid.source(function (hash) {
        return blobs.get(desigil(hash))
      }, 'blobId'),

      has: valid.async(function (hash, cb) {
        //emit blobs:has event when this api is called remotely.
        //needed to make tests pass. should probably remove this.
        if(this.id) sbot.emit('blobs:has', hash)
        blobs.has(desigil(hash), cb)
      }, 'blobId|array'),

      size: valid.async(function (hash, cb) {
        //sbot.emit('blobs:size', hash)
        blobs.size(desigil(hash), cb)
      }, 'blobId|array'),

      add: valid.sink(function (hash, cb) {
        // cb once blob is successfully added.
        // sink cbs are not exposed over rpc
        // so this is only available when using this api 
        if(isFunction(hash)) cb = hash, hash = null
locally.

        return blobs.add(desigil(hash), function (err, hash) {
          if(!err) {
            hash = resigil(hash)
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

      rm: valid.async(function (hash, cb) {
        return blobs.rm(desigil(hash), cb)
      }, 'string'),

      ls: function (opts) {
        return pull(blobs.ls(opts), pull.map(function (e) {
          if(e.sync) return e
          if(isString(e)) return resigil(e)
          e.id = resigil(e.id)
          return e
        }))
      },
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
        blobs.has(desigil(hash), function (_, has) {
          if (has) return cb(null, true)
          // update queue
          wantList.want(hash, id, cb)
        })
      }, 'blobId', 'object?'),

      changes: function () {
        return notify.listen()
      },

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
