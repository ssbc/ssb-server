var tape      = require('tape')
var fs        = require('fs')
var pathlib   = require('path')
var pull      = require('pull-stream')
var ssbKeys   = require('ssb-keys')
var osenv     = require('osenv')
var mkdirp    = require('mkdirp')
var rimraf    = require('rimraf')
var multicb   = require('multicb')

function read (filename) {
  return toPull.source(fs.createReadStream(filename))
}

var createSbot = require('../')
  .use(require('../plugins/blobs'))
  .use(require('../plugins/bundles'))
  .use(require('../plugins/logging'))

// create temporary directories
var tmpdirpath1 = pathlib.join(osenv.tmpdir(), 'tmp1')
var tmpdirpath2 = pathlib.join(osenv.tmpdir(), 'tmp2')
var tmpdirpath3 = pathlib.join(osenv.tmpdir(), 'tmp3')
rimraf.sync(tmpdirpath1); mkdirp.sync(tmpdirpath1)
rimraf.sync(tmpdirpath2); mkdirp.sync(tmpdirpath2)
rimraf.sync(tmpdirpath3); mkdirp.sync(tmpdirpath3)

fs.writeFileSync(pathlib.join(tmpdirpath1, 'file1.txt'), 'one')
fs.writeFileSync(pathlib.join(tmpdirpath1, 'file2.txt'), 'two')
fs.writeFileSync(pathlib.join(tmpdirpath1, 'file3.txt'), 'three')

tape('create, read, list, update, remove working bundles', function (t) {
  var sbot = createSbot({
    temp: 'test-bundles-1',
    timeout: 1000,
    keys: ssbKeys.generate()
  })

  sbot.bundles.createWorking({ dirpath: tmpdirpath1, name: 'Temp', desc: 'my test' }, function (err, bundle1) {
    if (err) throw err
    t.ok(bundle1.id)
    t.equal(bundle1.dirpath, tmpdirpath1)
    t.equal(bundle1.desc, 'my test')

    sbot.bundles.get(bundle1.id, function (err, _bundle1) {
      if (err) throw err
      t.equal(bundle1.id, _bundle1.id)
      t.equal(bundle1.dirpath, _bundle1.dirpath)
      t.equal(bundle1.desc, _bundle1.desc)

      pull(sbot.bundles.listWorkingFiles(bundle1.id), pull.collect(function (err, files) {
        if (err) throw err
        t.equal(files.length, 3)

        sbot.bundles.createWorking({ dirpath: tmpdirpath2, name: 'Temp2', desc: 'my test' }, function (err, bundle2) {
          if (err) throw err
          t.ok(bundle2.id)
          t.equal(bundle2.dirpath, tmpdirpath2)
          t.equal(bundle2.desc, 'my test')

          pull(sbot.bundles.listWorking(), pull.collect(function (err, bundles) {
            if (err) throw err
            t.equal(bundles.length, 2)
            t.equal(bundle1.id, bundles[0].id)
            t.equal(bundle1.dirpath, bundles[0].dirpath)
            t.equal(bundle1.desc, bundles[0].desc)
            t.equal(bundle2.id, bundles[1].id)
            t.equal(bundle2.dirpath, bundles[1].dirpath)
            t.equal(bundle2.desc, bundles[1].desc)

            sbot.bundles.updateWorking(bundle1.id, { dirpath: tmpdirpath3 }, function (err) {
              if (err) throw err

              sbot.bundles.get(bundle1.id, function (err, bundle1) {
                if (err) throw err
                t.equal(bundle1.dirpath, tmpdirpath3)

                sbot.bundles.removeWorking(bundle2.id, function (err) {
                  if (err) throw err

                  pull(sbot.bundles.listWorking(), pull.collect(function (err, bundles) {
                    if (err) throw err
                    t.equal(bundles.length, 1)
                    t.equal(bundle1.id, bundles[0].id)
                    t.equal(bundle1.dirpath, bundles[0].dirpath)

                    t.end()
                    sbot.close()
                  }))
                })
              })
            })
          }))
        })
      }))
    })
  })
})

tape('publish bundle, get published bundle, working version is updated', function (t) {
  var user = ssbKeys.generate()
  var sbot = createSbot({
    temp: 'test-bundles-2',
    timeout: 1000,
    keys: user
  })

  sbot.bundles.createWorking({ dirpath: tmpdirpath1, name: 'Temp', desc: 'my test' }, function (err, bundle1) {
    if (err) throw err

    // publish the first time
    sbot.bundles.publishWorking(bundle1.id, { desc: 'my published' }, [
      pathlib.join(tmpdirpath1, 'file1.txt'),
      pathlib.join(tmpdirpath1, 'file2.txt')
    ], function (err, msg) {
      if (err) throw err
      console.log('published msg', msg)
      t.equal(msg.value.content.includes.length, 2)
    })

    sbot.once('bundles:processed', function (b) {
      sbot.bundles.get(b.id, function (err, published1) {
        if (err) throw err

        // check published version
        t.equal(published1.id, b.id)
        t.equal(published1.name, 'temp')
        t.equal(published1.desc, 'my published')
        t.equal(published1.author, user.id)
        t.ok(published1.timestamp)
        t.equal(published1.blobs['/file1.txt'].path, '/file1.txt')
        t.equal(published1.blobs['/file1.txt'].type, 'text/plain')
        t.equal(published1.blobs['/file2.txt'].path, '/file2.txt')
        t.equal(published1.blobs['/file2.txt'].type, 'text/plain')

        sbot.bundles.get(bundle1.id, function (err, working) { 
          if (err) throw err

          // check that the working blob now points to published version
          t.equal(working.id, bundle1.id)
          t.equal(working.root, published1.id)
          t.equal(working.branch, published1.id)

          // publish again
          sbot.bundles.publishWorking(bundle1.id, null, [
            pathlib.join(tmpdirpath1, 'file1.txt'),
            pathlib.join(tmpdirpath1, 'file2.txt'),
            pathlib.join(tmpdirpath1, 'file3.txt')
          ], function (err, msg2) {
            if (err) throw err
            console.log('published msg', msg2)
            t.equal(msg2.value.content.includes.length, 3)
          })

          sbot.once('bundles:processed', function (b) {
            sbot.bundles.get(b.id, function (err, published2) {
              if (err) throw err

              // check published version
              t.equal(published2.id, b.id)
              t.equal(published2.name, 'temp')
              t.equal(published2.desc, 'my test')
              t.equal(published2.author, user.id)
              t.ok(published2.timestamp)
              t.equal(published2.blobs['/file1.txt'].path, '/file1.txt')
              t.equal(published2.blobs['/file1.txt'].type, 'text/plain')
              t.equal(published2.blobs['/file2.txt'].path, '/file2.txt')
              t.equal(published2.blobs['/file2.txt'].type, 'text/plain')
              t.equal(published2.blobs['/file3.txt'].path, '/file3.txt')
              t.equal(published2.blobs['/file3.txt'].type, 'text/plain')

              sbot.bundles.get(bundle1.id, function (err, working) { 
                if (err) throw err

              // check that the working blob now points to both published versions
                t.equal(working.id, bundle1.id)
                t.equal(working.root, published1.id)
                t.equal(working.branch, published2.id)
                t.end()
                sbot.close()
              })
            })
          })
        })
      })
    })
  })
})

tape('get/set default bundle at name', function (t) {
  var sbot = createSbot({
    temp: 'test-bundles-3',
    timeout: 1000,
    keys: ssbKeys.generate()
  })

  sbot.bundles.createWorking({ dirpath: tmpdirpath1, name: 'Temp', desc: 'my test' }, function (err, working) {
    if (err) throw err

    sbot.bundles.publishWorking(working.id, null, [
      pathlib.join(tmpdirpath1, 'file1.txt'),
      pathlib.join(tmpdirpath1, 'file2.txt'),
      pathlib.join(tmpdirpath1, 'file3.txt')
    ], function (err, msg) {
      if (err) throw err
      console.log('published msg', msg)
    })

    sbot.on('bundles:processed', function (bundle) {
      sbot.bundles.setForkAsDefault(bundle.id, function (err) {
        if (err) throw err

        var done = multicb({ pluck: 1 })
        sbot.bundles.lookup('/Temp', done())
        sbot.bundles.lookup('Temp', done())
        sbot.bundles.lookup('/temp', done())
        sbot.bundles.lookup('/Temp/foo/bar', done())
        done(function (err, bundleids) {
          if (err) throw err
          t.equal(bundleids.filter(function (id) { return id == bundle.id }).length, 4)

          // set the working bundle to default
          sbot.bundles.setForkAsDefault(working.id, function (err) {
            if (err) throw err

            var done = multicb({ pluck: 1 })
            sbot.bundles.lookup('/Temp', done())
            sbot.bundles.lookup('Temp', done())
            sbot.bundles.lookup('/temp', done())
            sbot.bundles.lookup('/Temp/foo/bar', done())
            done(function (err, bundleids) {
              if (err) throw err
              t.equal(bundleids.filter(function (id) { return id == working.id }).length, 4)

              // remove the working bundle and check that the mapping is nullified too
              sbot.bundles.removeWorking(working.id, function (err) {
                if (err) throw err
                sbot.bundles.lookup('Temp', function (err, bid) {
                  if (err) throw err
                  t.equal(bid, undefined)
                  t.end()
                  sbot.close()
                })
              })
            })
          })
        })
      })
    })
  })
})

tape('list revisions of a name and of a bundle', function (t) {
  var sbot = createSbot({
    temp: 'test-bundles-4',
    timeout: 1000,
    keys: ssbKeys.generate()
  })

  // create a working bundle
  sbot.bundles.createWorking({ dirpath: tmpdirpath1, name: 'Temp', desc: 'my test' }, function (err, bundle1) {
    if (err) throw err
    t.ok(bundle1.id)
    t.equal(bundle1.dirpath, tmpdirpath1)

    // publish a first version
    sbot.bundles.publishWorking(bundle1.id, { desc: 'my published' }, [
      pathlib.join(tmpdirpath1, 'file1.txt'),
      pathlib.join(tmpdirpath1, 'file2.txt')
    ], function (err, msg) {
      if (err) throw err
      console.log('published msg', msg)
    })
    sbot.once('bundles:processed', function (publishedBundle1) {

      // publish a second version
      sbot.bundles.publishWorking(bundle1.id, null, [
        pathlib.join(tmpdirpath1, 'file1.txt'),
        pathlib.join(tmpdirpath1, 'file2.txt'),
        pathlib.join(tmpdirpath1, 'file3.txt')
      ], function (err, msg) {
        if (err) throw err
        console.log('published msg', msg)
      })

      sbot.once('bundles:processed', function (publishedBundle2) {

        // get all revisions of the name
        pull(sbot.bundles.listRevisions('Temp'), pull.collect(function (err, bundles) {
          if (err) throw err
          t.equal(bundles.length, 3)
          t.equal(bundles[2].id, bundle1.id)
          t.ok(bundles[0].id === publishedBundle1.id || bundles[1].id === publishedBundle1.id)
          t.ok(bundles[0].id === publishedBundle2.id || bundles[1].id === publishedBundle2.id)

          // get just the root revisions of the name
          pull(sbot.bundles.listRevisions('Temp', { root: null }), pull.collect(function (err, bundles) {
            if (err) throw err
            t.equal(bundles.length, 1)
            t.equal(bundles[0].id, publishedBundle1.id)

            // get revisions of the first published version
            pull(sbot.bundles.listRevisions(publishedBundle1.id), pull.collect(function (err, bundles) {
              if (err) throw err
              t.equal(bundles.length, 2)
              t.equal(bundles[0].id, publishedBundle2.id)
              t.equal(bundles[1].id, bundle1.id)
              t.end()
              sbot.close()
            }))
          }))
        }))
      })
    })
  })
})

tape('get blob meta from working and published bundle, and from absolute paths', function (t) {
  var sbot = createSbot({
    temp: 'test-bundles-5',
    timeout: 1000,
    keys: ssbKeys.generate()
  })

  sbot.bundles.createWorking({ dirpath: tmpdirpath1, name: 'Temp', desc: 'my test' }, function (err, bundle1) {
    if (err) throw err
    t.ok(bundle1.id)
    t.equal(bundle1.dirpath, tmpdirpath1)

    sbot.bundles.publishWorking(bundle1.id, null, [
      pathlib.join(tmpdirpath1, 'file1.txt'),
      pathlib.join(tmpdirpath1, 'file2.txt')
    ], function (err, msg) {
      if (err) throw err
      console.log('published msg', msg)
    })

    sbot.once('bundles:processed', function (publishedBundle1) {

      sbot.bundles.setForkAsDefault(publishedBundle1.id, function (err) {
        if (err) throw err

        var done = multicb({ pluck: 1 })
        sbot.bundles.getBlobMeta(bundle1.id, '/file1.txt', done())
        sbot.bundles.getBlobMeta(bundle1.id, 'file1.txt', done())
        sbot.bundles.getBlobMeta(bundle1.id, './file1.txt', done())
        sbot.bundles.getBlobMeta(bundle1.id+'/file1.txt', done())
        sbot.bundles.getBlobMeta(publishedBundle1.id, '/file1.txt', done())
        sbot.bundles.getBlobMeta(publishedBundle1.id, 'file1.txt', done())
        sbot.bundles.getBlobMeta(publishedBundle1.id, './file1.txt', done())
        sbot.bundles.getBlobMeta(publishedBundle1.id+'/file1.txt', done())
        sbot.bundles.getBlobMeta('/Temp/file1.txt', done())
        done(function (err, metas) {
          if (err) throw err

          t.equal(metas[0].path, pathlib.join(tmpdirpath1, 'file1.txt'))
          t.deepEqual(metas[1], metas[0])
          t.deepEqual(metas[2], metas[0])
          t.deepEqual(metas[3], metas[0])
          t.equal(metas[4].path, '/file1.txt')
          t.equal(metas[4].type, 'text/plain')
          t.deepEqual(metas[5], metas[4])
          t.deepEqual(metas[6], metas[4])
          t.deepEqual(metas[7], metas[4])
          t.deepEqual(metas[8], metas[4])
          t.end()
          sbot.close()
        })
      })        
    })
  })  
})

tape('get blob from working and published bundle, and from absolute path', function (t) {
  var sbot = createSbot({
    temp: 'test-bundles-6',
    timeout: 1000,
    keys: ssbKeys.generate()
  })

  sbot.bundles.createWorking({ dirpath: tmpdirpath1, name: 'Temp', desc: 'my test' }, function (err, bundle1) {
    if (err) throw err
    t.ok(bundle1.id)
    t.equal(bundle1.dirpath, tmpdirpath1)

    sbot.bundles.publishWorking(bundle1.id, null, [
      pathlib.join(tmpdirpath1, 'file1.txt'),
      pathlib.join(tmpdirpath1, 'file2.txt')
    ], function (err, msg) {
      if (err) throw err
      console.log('published msg', msg)
    })

    sbot.once('bundles:processed', function (publishedBundle1) {

      sbot.bundles.setForkAsDefault(publishedBundle1.id, function (err) {
        if (err) throw err

        var done = multicb({ pluck: 1 })
        pull(sbot.bundles.getBlob(bundle1.id, '/file1.txt'), pull.collect(done()))
        pull(sbot.bundles.getBlob(bundle1.id, 'file1.txt'), pull.collect(done()))
        pull(sbot.bundles.getBlob(bundle1.id, './file1.txt'), pull.collect(done()))
        pull(sbot.bundles.getBlob(bundle1.id+'/file1.txt'), pull.collect(done()))
        pull(sbot.bundles.getBlob(publishedBundle1.id, '/file1.txt'), pull.collect(done()))
        pull(sbot.bundles.getBlob(publishedBundle1.id, 'file1.txt'), pull.collect(done()))
        pull(sbot.bundles.getBlob(publishedBundle1.id, './file1.txt'), pull.collect(done()))
        pull(sbot.bundles.getBlob(publishedBundle1.id+'/file1.txt'), pull.collect(done()))
        pull(sbot.bundles.getBlob('/Temp/file1.txt'), pull.collect(done()))
        done(function (err, blobs) {
          if (err) throw err

          t.equal(blobs.filter(function (blob) { return blob[0] == 'one' }).length, blobs.length)
          t.end()
          sbot.close()
        })
      })        
    })
  })  
})

tape('checkout published bundle', function (t) {
  var sbot = createSbot({
    temp: 'test-bundles-7',
    timeout: 1000,
    keys: ssbKeys.generate()
  })

  sbot.bundles.createWorking({ dirpath: tmpdirpath1, name: 'Temp', desc: 'my test' }, function (err, bundle1) {
    if (err) throw err
    t.ok(bundle1.id)
    t.equal(bundle1.dirpath, tmpdirpath1)

    sbot.bundles.publishWorking(bundle1.id, null, [
      pathlib.join(tmpdirpath1, 'file1.txt'),
      pathlib.join(tmpdirpath1, 'file2.txt')
    ], function (err, msg) {
      if (err) throw err
      console.log('published msg', msg)
    })

    sbot.once('bundles:processed', function (publishedBundle1) {

      sbot.bundles.setForkAsDefault(publishedBundle1.id, function (err) {
        if (err) throw err

        sbot.bundles.checkout(publishedBundle1.id, tmpdirpath2, function (err) {
          if (err) throw err

          var files = fs.readdirSync(tmpdirpath2)
          t.deepEqual(files, ['file1.txt', 'file2.txt'])

          var done = multicb()
          sbot.bundles.checkoutBlob(publishedBundle1.id, '/file1.txt', pathlib.join(tmpdirpath2, 'out1.txt'), done())
          sbot.bundles.checkoutBlob(publishedBundle1.id, 'file1.txt', pathlib.join(tmpdirpath2, 'out2.txt'), done())
          sbot.bundles.checkoutBlob(publishedBundle1.id, './file1.txt', pathlib.join(tmpdirpath2, 'out3.txt'), done())
          sbot.bundles.checkoutBlob(publishedBundle1.id+'/file1.txt', pathlib.join(tmpdirpath2, 'out4.txt'), done())
          sbot.bundles.checkoutBlob('/Temp/file1.txt', pathlib.join(tmpdirpath2, 'out1.txt'), done())
          done(function (err) {
            if (err) throw err
            t.equal(fs.readFileSync(pathlib.join(tmpdirpath2, 'out1.txt'), { encoding: 'utf-8' }), 'one')
            t.equal(fs.readFileSync(pathlib.join(tmpdirpath2, 'out2.txt'), { encoding: 'utf-8' }), 'one')
            t.equal(fs.readFileSync(pathlib.join(tmpdirpath2, 'out3.txt'), { encoding: 'utf-8' }), 'one')
            t.equal(fs.readFileSync(pathlib.join(tmpdirpath2, 'out4.txt'), { encoding: 'utf-8' }), 'one')
            t.end()
            sbot.close()
          })
        })
      })
    })
  })  
})
