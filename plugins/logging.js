var color = require('bash-color')

function indent (o) {
  return o.split('\n').map(function (e) {
    return '  ' + e
  }).join('\n')
}

function formatter(level, log) {
  return function (ary) {
    var plug = ary[0].substring(0, 4)
    var id = ary[1]
    var verb = ary[2]
    var data = ary.length > 4 ? ary.slice(3) : ary[3]
    var _data = JSON.stringify(data) || ''
    var pre = [plug, id, color.cyan(verb)].join(' ')
    if(process.stdout.rows > (5 + pre.length + 1 + _data.length))
      console.log([level, pre, _data].join(' '))
    else {
      console.log([level, pre].join(' '))
      console.log(indent(JSON.stringify(data, null, 2)))
    }
  }
}

module.exports = function(server) {
  server.on('log:info',    formatter(color.green('info')))
  server.on('log:warning', formatter(color.yellow('warn')))
  server.on('log:error',   formatter(color.red('err!')))
}
