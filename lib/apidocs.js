var fs = require('fs')
var path = require('path')
module.exports = {
  _: fs.readFileSync(path.join(__dirname, '../api.md'), 'utf-8'),
  //  blobs: fs.readFileSync(path.join(__dirname, '../plugins/blobs.md'), 'utf-8'),
  friends: fs.readFileSync(path.join(__dirname, '../plugins/friends.md'), 'utf-8'),
  gossip: fs.readFileSync(path.join(__dirname, '../plugins/gossip.md'), 'utf-8'),
  invite: fs.readFileSync(path.join(__dirname, '../plugins/invite.md'), 'utf-8'),
  plugins: fs.readFileSync(path.join(__dirname, '../plugins/plugins.md'), 'utf-8'),
  replicate: fs.readFileSync(path.join(__dirname, '../plugins/replicate.md'), 'utf-8')
}
