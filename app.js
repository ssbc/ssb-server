var ssbKeys  = require('ssb-keys')
var manifest = require('./lib/manifest')
var pull     = require('pull-stream')
var path     = require('path')
var ssb      = require('secure-scuttlebutt')

var mainKeys = ssbKeys.loadSync(path.join(require('ssb-config').path, 'secret'))
console.log('Loaded main keypair, public:', mainKeys.public)
var appKeys = ssbKeys.generate()
console.log('Generated app keypair, public:', appKeys.public)

var rpc = require('./client')('localhost:2000', manifest, function (err) {
  if(err) throw err
})

var createMsg = require('secure-scuttlebutt/message')(require('secure-scuttlebutt/defaults'))

rpc.auth(ssbKeys.signObj(mainKeys, {
  role: 'client',
  ts: Date.now(),
  public: mainKeys.public
}), function (err) {
  if(err)
    throw err
  console.log('Gained rpc access to sbot')

  var init = createMsg(appKeys, null, { type: 'init', public: appKeys.public })
  var post = createMsg(appKeys, null, { type: 'post', text: 'hello world' }, init)
  rpc.add(init, function (err) {
    if (err) throw err
    console.log('published init')
    rpc.add(post, function (err) {
      if (err) throw err
      console.log('published post')
    })
  })
})