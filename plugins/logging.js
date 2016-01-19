var color = require('bash-color')

function indent (o) {
  return o.split('\n').map(function (e) {
    return '  ' + e
  }).join('\n')
}

function isString(s) {
  return 'string' === s
}

function formatter(id, level) {
  var b = id.substring(0, 4)
  return function (ary) {
    var plug = ary[0].substring(0, 4).toUpperCase()
    var id = ary[1]
    var verb = ary[2]
    var data = ary.length > 4 ? ary.slice(3) : ary[3]
    var _data = (isString(data) ? data : JSON.stringify(data)) || ''

    var pre = [plug, id, color.cyan(verb)].join(' ')
    var length = (5 + pre.length + 1 + _data.length)
    var lines = isString(data) && data.split('\n').length > 1

    var c = process.stdout.columns
    if((process.stdout.columns > length) && !lines)
      console.log([level, b, pre, _data].join(' '))
    else {
      console.log([level, b, pre].join(' '))
      if(lines)
        console.log(indent(data))
      else if(data && data.stack)
        console.log(indent(data.stack))
      else if(data) {
        console.log(indent(JSON.stringify(data, null, 2)))
      }
    }
  }
}

module.exports = function logging (server) {
  var id = server.id
  server.on('log:info',    formatter(id, color.green('info')))
  server.on('log:notice',  formatter(id, color.blue('note')))
  server.on('log:warning', formatter(id, color.yellow('warn')))
  server.on('log:error',   formatter(id, color.red('err!')))
}

module.exports.init = module.exports
