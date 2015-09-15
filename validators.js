var valid = require('muxrpc-validation')
var zerr  = require('zerr')
var ref   = require('ssb-ref')

// errors
var MissingAttr = zerr('Usage', 'Param % must have a .% of type "%"')
var AttrType = zerr('Usage', '.% of param % must be of type "%"')

function isFilter (v) {
  return (v == '@' || v == '%' || v == '&')
}

valid.set('msgId', function (v) {
  if (!ref.isMsg(v))
    return 'type'
})
valid.set('feedId', function (v) {
  if (!ref.isFeed(v))
    return 'type'
})
valid.set('blobId', function (v) {
  if (!ref.isBlob(v))
    return 'type'
})

valid.set('msgContent', function (v, n) {
  var err = valid.get('object')(v, n)
  if (err) return err
  if (!v.type || typeof v.type != 'string')
    return MissingAttr(n, 'type', 'string')
})

valid.set('msg', function (v, n) {
  var err = valid.get('object')(v, n)
  if (err)
    return err
  
  // .content
  var err = valid.get('object')(v.content, n)
  if (err) 
    return MissingAttr(n, 'content', 'object')

  // .content.type
  if (!v.content.type || typeof v.content.type != 'string')
    return MissingAttr(n, 'content.type', 'string')

  // .author
  if (!ref.isFeed(v.author))
    return MissingAttr(n, 'author', 'feedId')

  // .sequence
  if (typeof v.sequence != 'number')
    return MissingAttr(n, 'sequence', 'number')

  // .previous
  if (!ref.isMsg(v.previous))
    return MissingAttr(n, 'previous', 'msgId')

  // .timestamp
  if (typeof v.timestamp != 'number')
    return MissingAttr(n, 'timestamp', 'number')

  // .hash
  if (v.hash != 'sha256')
    return zerr('Usage', 'Param % must have .hash set to "sha256"')(n)

  // .signature
  if (typeof v.signature != 'string')
    return MissingAttr(n, 'signature', 'string')
})

valid.set('readStreamOpts', function (v, n) {
  var err = valid.get('object')(v, n)
  if (err)
    return err

  // .live
  if (v.live && typeof v.live != 'boolean' && typeof v.live != 'number')
    return AttrType(n, 'live', 'boolean')

  // .gt
  if (v.gt && typeof v.gt != 'number')
    return AttrType(n, 'gt', 'number')

  // .gte
  if (v.gte && typeof v.gte != 'number')
    return AttrType(n, 'gte', 'number')

  // .lt
  if (v.lt && typeof v.lt != 'number')
    return AttrType(n, 'lt', 'number')

  // .lte
  if (v.lte && typeof v.lte != 'number')
    return AttrType(n, 'lte', 'number')

  // .reverse
  if (v.reverse && typeof v.reverse != 'boolean' && typeof v.reverse != 'number')
    return AttrType(n, 'reverse', 'boolean')

  // .keys
  if (v.keys && typeof v.keys != 'boolean' && typeof v.keys != 'number')
    return AttrType(n, 'keys', 'boolean')

  // .values
  if (v.values && typeof v.values != 'boolean' && typeof v.values != 'number')
    return AttrType(n, 'values', 'boolean')

  // .limit
  if (v.limit && typeof v.limit != 'number')
    return AttrType(n, 'limit', 'number')

  // .fillCache
  if (v.fillCache && typeof v.fillCache != 'boolean' && typeof v.fillCache != 'number')
    return AttrType(n, 'fillCache', 'boolean')
})

valid.set('createHistoryStreamOpts', function (v, n) {
  // .id
  if (!ref.isFeed(v.id))
    return MissingAttr(n, 'id', 'feedId')

  // .seq
  if (v.seq && typeof v.seq != 'number')
    return AttrType(n, 'seq', 'number')

  // .live
  if (v.live && typeof v.live != 'boolean' && typeof v.live != 'number')
    return AttrType(n, 'live', 'boolean')
})

valid.set('createUserStreamOpts', function (v, n) {
  var err = valid.get('readStreamOpts')(v, n)
  if (err)
    return err

  // .id
  if (!ref.isFeed(v.id))
    return MissingAttr(n, 'id', 'feedId')
})

valid.set('messagesByTypeOpts', function (v, n) {
  var err = valid.get('readStreamOpts')(v, n)
  if (err)
    return err

  // .type
  if (typeof v.type != 'string')
    return MissingAttr(n, 'type', 'string')
})

valid.set('linksOpts', function (v, n) {
  var err = valid.get('object')(v, n)
  if (err)
    return err

  // .source
  if (v.source && !ref.isLink(v.source) && !isFilter(v.source))
    return AttrType(n, 'source', 'id|filter')

  // .dest
  if (v.dest && !ref.isLink(v.dest) && !isFilter(v.dest))
    return AttrType(n, 'dest', 'id|filter')

  // .rel
  if (v.rel && typeof v.rel != 'string')
    return AttrType(n, 'rel', 'string')

  // .live
  if (v.live && typeof v.live != 'boolean' && typeof v.live != 'number')
    return AttrType(n, 'live', 'boolean')

  // .reverse
  if (v.reverse && typeof v.reverse != 'boolean' && typeof v.reverse != 'number')
    return AttrType(n, 'reverse', 'boolean')

  // .keys
  if (v.keys && typeof v.keys != 'boolean' && typeof v.keys != 'number')
    return AttrType(n, 'keys', 'boolean')

  // .values
  if (v.values && typeof v.values != 'boolean' && typeof v.values != 'number')
    return AttrType(n, 'values', 'boolean')
})

valid.set('relatedMessagesOpts', function (v, n) {
  var err = valid.get('object')(v, n)
  if (err)
    return err

  // .id
  if (!ref.isMsg(v.id))
    return MissingAttr(n, 'id', 'msgId')

  // .rel
  if (v.rel && typeof v.rel != 'string')
    return AttrType(n, 'rel', 'string')

  // .count
  if (v.count && typeof v.count != 'boolean' && typeof v.count != 'number')
    return AttrType(n, 'count', 'boolean')

  // .parent
  if (v.parent && typeof v.parent != 'boolean' && typeof v.parent != 'number')
    return AttrType(n, 'parent', 'boolean')
})