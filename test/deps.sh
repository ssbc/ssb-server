#! /usr/bin/env bash

#symlink to self, so that modules load the right thing
cd node_modules
ln -s ../ ssb-server
cd ..

set -e

name () {
  while read r
  do
    echo "$1": $r
  done
}

test () {
  echo "## TESTING DEPENDENCY: $1"
  pushd node_modules/$1
  npm test | name $1
  popd
}

test ssb-friends
test ssb-blobs
test ssb-invite
test ssb-replicate
test ssb-ebt

