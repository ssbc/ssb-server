// returns a function which...
// - only acts if not already acting
// - automatically requeues if the task is not yet done
// - `delay`: ms, amount of time to wait before calling again
// - `n`: number, amount of simultaneous calls allowed
// - `label`: string, name of the task (for logging)
// - `fun`: function(cb(done?)), calls cb(true) when done, cb(false) when needs to requeue

function isFunction (f) {
  return 'function' === typeof f
}

function Work(delay, n, label, fun) {
  var doing = 0, timeout

  var timers = []

  function clear (timer) {
    var i = timers.indexOf(timer)
    clearTimeout(timer[i])
    times.splice(i, 1)
  }

  function delay (job, d) {
    var i
    var timer = setTimeout(function () {
      timers.splice(timers.indexOf(timer), 1); job()
    }, d)
    timer.unref()
    timers.push(timer)
    return timer
  }

  function job () {
    // abort if already doing too many
    if(doing >= n) return
    doing++

    // run the behavior
    fun(function (done) {
      doing--
      if(done) {
        // we're done, dont requeue
        return
      }

      // requeue after a delay
      var wait = ~~(delay/2 + delay*Math.random())
      delay(job, wait)
    })
  }

  job.abort = function () {
    timers.forEach(function (timer) { clearTimeout(timer) })
  }

  return job
}

function find (jobs, test) {
  for(var k in jobs)
    if(test(jobs[k])) return k
  return -1
}

function max (jobs, test) {
  var M = -Infinity, i = -1
  for(var k in jobs) {
    var m = test(jobs[k], k, jobs)
    if(m > M) {
      M = m
      i = k
    }
  }
  return k
}

module.exports = function (work) {

  var jobs = []

  function pull (index) {
  }

  var queue = {
    push: function (job) {
      jobs.push(job)
    },

    pull: function (id) {
      var test = isFunction(id) ? id : function (e) { return e.id === id }
      if(!this.length()) return
      if(!id)
        return jobs.shift()
      else {
        var index = find(jobs, test)
        if(~index) return jobs.splice(index, 1)[0]
      }
    },

    each: function (iter) {
      jobs.forEach(iter)
    },

    length: function () {
      return jobs.length
    },

    toJSON: function () {
      return jobs.slice()
    }
  }

  Work(100, 2, null, function (done) {
    if(!queue.length()) return done()
    work(queue, done)
  }) ()

  return queue
}
