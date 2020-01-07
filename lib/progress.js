//poll the progress() function and report how much waiting there is...
//just whipped this up, obviously room for improvement here.
module.exports = function (progress) {
  function bar (r) {
    var s = '\r', M = 50
    for(var i = 0; i < M; i++)
      s += i < M*r ? '*' : '.'

    return s
  }

  function round (n, p) {
    return Math.round(n * p) / p
  }

  function percent (n) {
    return (round(n, 1000)*100).toString().substring(0, 4)+'%'
  }

  function rate (prog) {
    if(prog.target == prog.current) return 1
    return (prog.current - prog.start) / (prog.target - prog.start)
  }

  var prog = -1
  var int = setInterval(function () {
    var p = progress()
    var r = 1
    var tasks = []
    for(var k in p) {
      var _r = rate(p[k])
      if(_r < 1)
        tasks.push(k+':'+percent(_r))
      r = Math.min(_r, r)
    }
    if(r != prog) {
      prog = r
      var msg = tasks.join(', ')
      process.stdout.write('\r'+bar(prog) + ' ('+msg+')\x1b[K\r')
    }
  }, 333)
  int.unref && int.unref()
}
