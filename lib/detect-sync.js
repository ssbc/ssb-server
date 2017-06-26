module.exports = function detectSync (peerId, upto, toSend, peerHas, onSync) {
  // HACK: createHistoryStream does not emit sync event, so we don't
  // know when it switches to live. Do it manually!

  var sync = false
  var last = (upto.sequence || upto.seq || 0)

  // check sync after 500ms, hopefully we have the info from the peer by then
  setTimeout(function () {
    if (peerHas[peerId] && peerHas[peerId][upto.id] != null) {
      checkSync()
    } else {
      // if we get here, the peer hasn't yet asked for this feed, or is not responding
      // we can assume it doesn't have the feed, so lets call sync
      broadcastSync()
    }
  }, 500)

  return function (msg) {
    if (msg.sync) {
      // surprise! This peer actually has a sync event!
      broadcastSync()
      return false
    }

    last = msg.sequence
    checkSync()
    return true
  }

  function checkSync () {
    if (!sync) {
      var availableSeq = peerHas[peerId] && peerHas[peerId][upto.id]
      if (availableSeq === last || availableSeq < toSend[upto.id]) {
        // we've reached the maximum sequence this server has told us it knows about
        // or we don't need anything from this server
        broadcastSync()
      }
    }
  }

  function broadcastSync () {
    if (!sync) {
      sync = true
      onSync && onSync()
    }
  }
}
