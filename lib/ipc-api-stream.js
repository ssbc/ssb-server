'use strict'
// [I]nter[P]rocess [C]ommunication API Stream

// TODO put this into `pull-ipc` -prf

var pull = require('pull-stream')
var once = require('once')

// how to use

// from parent process:
// var stream = ipcApiStream(childProcess, function() { console.log('ipc stream is closed') })

// from child process:
// var stream = ipcApiStream(process, function() { console.log('ipc stream is closed') })

// then:
// var api = muxrpc(theirApiManifest, myApiManifest)(myApiDefinition)
// pull(stream, api.createStream(), stream)

module.exports = function (processObj, cb) {
  var listener
  return createChannelStream(
    // send function. this is how does the channel stream sends a message
    (function send (msg) {
      processObj.send(msg)
    }),
    // listen function. this registers a callback to handle incoming messages
    (function listen (cb) {
      processObj.on('message', (listener = function (msg) {
        cb(msg)
      }))
    }),
    // cleanup function. this is called on channel-close
    (function cleanup (err, v) {
      processObj.removeListener('message', listener)
      listener = null
      if (cb)
        cb(err, v)
    })
  )
}

// TODO is the serializer needed, or does node's IPC interface handle it?
// function serialize (stream) {
//   return Serializer(stream, JSON, {split: '\n\n'})
// }

function createChannelStream (send, listen, cleanup) {
  var buffer = [], ended = false, waiting

  var done = once(function (err, v) {
    ended = err || true
    cleanup(err, v)

    // deallocate
    waiting = null
  })

  // incoming msg handler
  listen(function onincoming (msg) {
    // console.log('in', msg)

    // parse if needed
    try {
      if (typeof msg == 'string')
        msg = JSON.parse(msg)
    } catch (e) {
      return
    }

    if (msg.bvalue) {
      // convert buffers to back to binary
      msg.value = new Buffer(msg.bvalue, 'base64')
      delete msg.bvalue
    }

    // send to pull-stream if it's waiting for data
    // otherwise, buffer the data
    if (waiting) {
      var cb = waiting
      waiting = null
      cb(ended, msg)
    }
    else if (!ended)
      buffer.push(msg)
  })

  // outgoing msg handler
  function onoutgoing (msg) { 
    // console.log('out', msg)

    if (msg.value && Buffer.isBuffer(msg.value)) {
      // convert buffers to base64
      msg.bvalue = msg.value.toString('base64')
      delete msg.value
    }
    send(msg)
  }

  // return source/sink
  return {
    source: function (abort, cb) {
      if (abort) {
        cb(abort)
        done(abort !== true ? abort : null)
      }
      else if (buffer.length) cb(null, buffer.shift())
      else if (ended) cb(ended)
      else waiting = cb
    },
    sink  : function (read) {
      pull.drain(function (data) {
        if (ended) return false
        onoutgoing(data)
      }, function (err) {
        if (done)
          done(err)
      })(read)
    }
  }
}