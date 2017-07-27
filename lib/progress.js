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
    return (round(n, 1000)*100).toString()+'%'
  }

  function rate (prog) {
    if(prog.target == prog.current) return 1
    return (prog.current - prog.start) / (prog.target - prog.start)
  }

  var prog = -1
  var int = setInterval(function () {
    var p = progress()
    var r = 1, c = 0
    var tasks = []
    for(var k in p) {
      var _r = rate(p[k])
      tasks.push(k+':'+percent(_r))
      r = Math.min(_r, r)
      c++
    }
    if(r != prog) {
      prog = r
      var msg = tasks.join(', ')
      process.stdout.write(bar(prog) + ' ('+msg+')')
    }
  }, 333)
  int.unref && int.unref()
}
