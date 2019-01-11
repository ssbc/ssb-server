var SecretStack = require('secret-stack')
var create     = require('ssb-db/create')
var ssbKeys    = require('ssb-keys')
var path       = require('path')
var osenv      = require('osenv')
var mkdirp     = require('mkdirp')
var rimraf     = require('rimraf')
var mdm        = require('mdmanifest')
var cmdAliases = require('./lib/cli-cmd-aliases')
var valid      = require('./lib/validators')
var pkg        = require('./package.json')
var path       = require('path')
var fs         = require('fs')


var SSB = require('ssb-db/plugin')


// live help RPC method
function usage (cmd) {
  var path = (cmd||'').split('.')
  if ((path[0] && apidocs[path[0]]) || (cmd && apidocs[cmd])) {
    // return usage for the plugin
    cmd = path.slice(1).join('.')
    return mdm.usage(apidocs[path[0]], cmd, { prefix: path[0] })
  }
  if (!cmd) {
    // return usage for all docs
    return Object.keys(apidocs).map(function (name) {
      if (name == '_')
        return mdm.usage(apidocs[name], null, { nameWidth: 20 })

      var text = mdm.usage(apidocs[name], null, { prefix: name, nameWidth: 20 })
      return text.slice(text.indexOf('Commands:') + 10) // skip past the toplevel summary, straight to the cmd list
    }).join('\n\n')
  }
  // toplevel cmd usage
  cmd = cmdAliases[cmd] || cmd
  return mdm.usage(apidocs._, cmd)
}

function createSsbServer() {
  return SecretStack({
    //this is just the default app key.
    //it can be overridden by passing a appKey as option
    //when creating a SsbServer instance.
    appKey: require('./lib/ssb-cap')
  })
    .use(SSB)
}

module.exports = createSsbServer()
module.exports.createSsbServer = createSsbServer





