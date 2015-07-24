
module.exports = function (api, opts) {
  var masters = [api.id].concat(opts.master).filter(Boolean)
  api.auth.hook(function (fn, args) {
    var id = args[0]
    var cb = args[1]
    cb(null, ~masters.indexOf(id) ? {allow: null, deny: null} : null)
  })
}
