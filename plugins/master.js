// master plugin
// allows you to define "master" IDs in the config
// which are given the full rights of the local main ID
module.exports = function (api, opts) {
  var masters = [api.id].concat(opts.master).filter(Boolean)
  api.auth.hook(function (fn, args) {
    var id = args[0]
    var cb = args[1]
    cb(null, ~masters.indexOf(id) ? {allow: null, deny: null} : null)
  })
}
