'use strict'

var Blobs = require('multiblob')
var path = require('path')
var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')
var isBlob = require('ssb-ref').isBlobId

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
  return '&' + hash
}

function clamp (n, lo, hi) {
  return Math.min(Math.max(n, lo), hi)
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
    //NOW PROVIDED BY CORE. REFACTOR THIS AWAY.
    var blobs = sbot._blobs = Blobs({
      dir: path.join(config.path, 'blobs'),
      hash: 'sha256'
    })

    var wantList = Replicate(sbot, config, blobs, notify)

    return {
      get: valid.source(function (hash) {
        return blobs.get(desigil(hash))
      }, 'blobId'),

      has: valid.async(function (hash, cb) {
        sbot.emit('blobs:has', hash)
        blobs.has(desigil(hash), cb)
      }, 'blobId|array'),

      size: valid.async(function (hash, cb) {
        sbot.emit('blobs:size', hash)
        blobs.size(desigil(hash), cb)
      }, 'blobId|array'),

      add: valid.sink(function (hash, cb) {
        if(isFunction(hash)) cb = hash, hash = null

        return pull(
          blobs.add(function (err, hash) {
            if(err) console.error(err.stack)
            else wantList.got(resigil(hash))
            // sink cbs are not exposed over rpc
            // so this is only available when using this api locally.
            if(cb) cb(err, resigil(hash))
          })
        )
      }, 'string?'),

      ls: function () {
        return pull(blobs.ls(), pull.map(resigil))
      },
      // request to retrieve a blob,
      // calls back when that file is available.
      // - `opts.nowait`: call cb immediately if not found (dont register for callback)
      want: valid.async(function (hash, opts, cb) {
        if (typeof opts == 'function') {
          cb = opts
          opts = null
        }
        var nowait = (opts && opts.nowait)
        if(!isBlob(hash)) return cb(new Error('not a hash:' + hash))

        sbot.emit('blobs:wants', hash)
        blobs.has(desigil(hash), function (_, has) {
          if (has) return cb(null, true)
          
          // update queue
            wantList.queue(hash, nowait ? cb(null, false) : cb)

          // track # of requests for prioritization
          wantList.byId[hash].requests = clamp(wantList.byId[hash].requests+1, 0, 20)
        })
      }, 'blobId', 'object?'),

      changes: function () {
        return notify.listen()
      },

      // get current want list
      wants: function () {
        return wantList.jobs
      }
    }
  }
}
