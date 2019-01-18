#! /usr/bin/env bash

#symlink to self, so that modules load the right thing
cd node_modules
ln -s ../ ssb-server
cd ..

set -e
test () {
  echo "## TESTING DEPENDENCY: $1"
  pushd node_modules/$1
  npm test
  popd
}



test ssb-friends
test ssb-blobs
test ssb-invite
test ssb-replicate
test ssb-ebt

