
module.exports = {
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
  'createUserStream'       : 'source',
  'createLogStream'        : 'source',
  'messagesByType'         : 'source',
  'messagesLinkedToMessage': 'source',
  'messagesLinkedToFeed'   : 'source',
  'messagesLinkedFromFeed' : 'source',
  'feedsLinkedToFeed'      : 'source',
  'feedsLinkedFromFeed'    : 'source',

  // admin api
  'followedUsers'          : 'source'
}

