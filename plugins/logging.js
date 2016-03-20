var color = require('bash-color')

// logging plugin
// subscribes to 'log:*' events
// and emits using lovely colors

var LOG_LEVELS = [
  'error',
  'warning',
  'notice',
  'info'
]
var DEFAULT_LEVEL = LOG_LEVELS.indexOf('notice')

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

module.exports = function logging (server, conf) {
  var level = conf.logging && conf.logging.level && LOG_LEVELS.indexOf(conf.logging.level) || DEFAULT_LEVEL
  if (level === -1) {
    console.log('Warning, logging.level configured to an invalid value:', conf.logging.level)
    console.log('Should be one of:', LOG_LEVELS.join(', '))
    level = DEFAULT_LEVEL
  }
  console.log('Log level:', LOG_LEVELS[level])

  var id = server.id
  if (level >= LOG_LEVELS.indexOf('info'))
    server.on('log:info',    formatter(id, color.green('info')))
  if (level >= LOG_LEVELS.indexOf('notice'))
    server.on('log:notice',  formatter(id, color.blue('note')))
  if (level >= LOG_LEVELS.indexOf('warning'))
    server.on('log:warning', formatter(id, color.yellow('warn')))
  if (level >= LOG_LEVELS.indexOf('error'))
    server.on('log:error',   formatter(id, color.red('err!')))
}

module.exports.init = module.exports
