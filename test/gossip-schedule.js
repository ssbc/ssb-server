
var tape = require('tape')
var u = require('../lib/util')

var schedule = require('../plugins/gossip/schedule')

var peers = require('./data/gossip.json')

tape('peers we have never connected to', function (t) {

  t.deepEqual(
    peers.filter(schedule.isUnattempted).map(u.stringifyAddress),
    [
      '131.72.139.47:8008:@V+sfZ+X/MSUb+cO3GVI4gn1cCVVwz1+t6B+J9DlUkQs=.ed25519',
      '24.75.24.253:8008:@WzvzUh2KMhAfWeJEpkI01BGlTtLXOei7GoB/dLVjcjE=.ed25519', '104.236.72.67:8008:@xBZ783+eCc9+vc/CHxR03y1nAcfULJUAOgd3zWsy1uY=.ed25519', 'evbogue.com:8008:@9sCXwCJZJ9doPcx7oZ1gm7HNZapO2Z9iZ0FJHJdROio=.ed25519'
    ]

  )

  t.end()
})

tape('peers we have attempted a connection, but failed', function (t) {
  t.deepEqual(
    peers.filter(schedule.isInactive).map(u.stringifyAddress),
    [
      '176.58.117.63:8008:@J+0DGLgRn8H5tVLCcRUfN7NfUcTGEZKqML3krEOJjDY=.ed25519',
      '88.198.115.222:8008:@im4Qn0fCzpD3YfsegHFLJzkNXYUb/nYnlfuCf+LmPuM=.ed25519', 
      'localhost:8008:@J+0DGLgRn8H5tVLCcRUfN7NfUcTGEZKqML3krEOJjDY=.ed25519',
      '24.75.24.253:8008:@JMnMSsDHjwZfUlC2J8ZiIAOoxM5KJfsvewmVe39/wSM=.ed25519',
      '74.207.246.247:8008:@omgyp7Pnrw+Qm0I6T6Fh5VvnKmodMXwnxTIesW2DgMg=.ed25519',
      '188.166.107.197:8008:@/RM1Id8j05uitIt6iwMpiivnCqHcbcC1IHyi5FrvLLQ=.ed25519',
      '9ithub.com:8008:@GLH9VPzvvU2KcnnUu2n5oxOqaTUtzw+Rk6fd/Kb9Si0=.ed25519',
      'newpi.ffhh:8080:@gYCJpN4eGDjHFnWW2Fcusj8O4QYbVDUW6rNYh7nNEnc=.ed25519',
      'acab.mobi:5228:@Ia0xWQGJSTjRfYjHDDAFizXR9e8l5RQctTqYcbtR+Es=.ed25519', 
      'pi.bret.io:8008:@j3qWwQrWPzTM9zNgk0SI0FcqP1ULGquuINYEWfL330g=.ed25519',
      'drinkbot.org:8008:@kOK9sfSLeFrQMtYaqLQ3nZE19v2IDiEwlpEdAqep3bw=.ed25519',
      'pub.mixmix.io:8008:@uRECWB4KIeKoNMis2UYWyB2aQPvWmS3OePQvBj2zClg=.ed25519',
      '178.62.206.163:110:@Uki1+Hds2kkx4rOWl202SPfcsgsdaLHJ/Y6OfPnK1xk=.ed25519',
      '104.131.122.139:8008:@kZ9Ra80lKWlmzfjxh5PFAjJWYlCHEPxbqxNajdzhPF8=.ed25519'
    ]
  )

  t.end()
})

tape('peers we have connected to, but are running legacy code', function (t) {
  t.deepEqual(
    peers.filter(schedule.isLegacy).map(u.stringifyAddress),
    [
      '188.166.252.233:8008:@uRECWB4KIeKoNMis2UYWyB2aQPvWmS3OePQvBj2zClg=.ed25519',
      '45.33.29.124:8008:@0GLMsG6IgXdv+GjG0U5UnZlwxHnomlfmrlWugx8i4dg=.ed25519',
      'mindeco.de:110:@Uki1+Hds2kkx4rOWl202SPfcsgsdaLHJ/Y6OfPnK1xk=.ed25519'
    ]
  )
  t.end()
})

tape('peers we have connected to, and are running new code', function (t) {
  t.deepEqual(
    peers.filter(schedule.isLongterm).map(u.stringifyAddress),
    [
      '128.199.132.182:8008:@DTNmX+4SjsgZ7xyDh5xxmNtFqa6pWi5Qtw7cE8aR9TQ=.ed25519'
    ]
  )
  t.end()
})




