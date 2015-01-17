# Scuttlebot

Scuttlebot is a node.js app for decentralized social networking. It runs on your computer and syncs over wifi, and through user-hosted "pub" servers. It ships with a discussions application and is open for users to hack on.

Scuttlebot was created for

 - Secure, cloud-free office communications
 - User-hackable web apps without walled gardens
 - Distributed (EC) systems research

Join us in #scuttlebutt on freenode.

[![build status](https://secure.travis-ci.org/ssbc/scuttlebot.png)](http://travis-ci.org/ssbc/scuttlebot)

**What is Secure Scuttlebutt?**

[Secure Scuttlebutt](https://github.com/ssbc/secure-scuttlebutt) (SSB) is a fully-decentralized data network designed to replace Web services. It uses cryptographic keypairs to gossip unforgeable data-feeds across the network. "Pub" servers aggregate and redistribute the feeds, but SSB has no central authority: every node is equal, and the network is fully open.


### Installing

Set up a local client, join the network, and post messages.
Please post an issue if the following does not work for you.

```
# first, install scuttlebot globally.

> npm install -g scuttlebot
```

If this gives you a permissions error, [fix it using the method here (recommended)](http://stackoverflow.com/questions/19352976/npm-modules-wont-install-globally-without-sudo) or install and run scuttlebot using sudo.

```
# start your local server

> sbot server

# now, in another tab, issue commands.

> sbot whoami
{
  "id": "wuDDnMxVtk8U9hrueDj/T0itgp5HJZ4ZDEJodTyoMdg=.blake2s",
  "public": "vUadxn7OumI4aaHa3FGNQZ+822rsaPvBeJoM4lQ6ayTZcOHlnb0+u41isdwGQv3t3qw//wvFH6JmeHTpJzmO2w==.k256"
}
```

The `whoami` command outputs your id and your public key. There are many other commands listed below.


### Web UI

Once the scuttlebot server is running, you can access the Web UI at `http://localhost:2000`. It will prompt you to setup your new account, then give you instructions on how to join the network. Follow them, or the instructions below.


### Joining the Network

Scuttlebot will automatically sync with other computers on your wifi. If you want to reach people outside your local network, you have to use a "pub" server - a scuttlebot instance running on a public static IP.

It's easy to [run your own pub server](#running-a-pub-server), but life's easier if you can join an existing pub ([see the informal registry of pub servers](https://github.com/ssbc/scuttlebot/wiki/Pub-Servers)). Ask a pub-owner for an invite, then run the following command. This sends a request to the server and asks it to follow you. You'll see a similar output if you use this command.

```
> sbot invite.addMe <invite-code>

[
  {
    "previous": "M9s8ow8TEkVrzrVfdOHs266ABOL58d50TYEduBMYLfM=.blake2s",
    "author": "wuDDnMxVtk8U9hrueDj/T0itgp5HJZ4ZDEJodTyoMdg=.blake2s",
    "sequence": 16,
    "timestamp": 1419570197842,
    "hash": "blake2s",
    "content": {
      "type": "follow",
      "feed": "TNn7v0MsAs8OpQnyRwtsMeROVWGlKnS/ItX966PAWjI=.blake2s",
      "rel": "follows"
    },
    "signature": "6CC1keA+VZJF2vDd2fjwS7ATPdEhSV+IFVaJNobSCkcvS5dz066UR1QNuRzilxlCA1zRo3wDvJm3rIEOWYzQrg==.blake2s.k256"
  },
  {
    "previous": "ylKOsS3KjsKAURQ+U7pDMABnDiMt2xHjpJonzDZCmkw=.blake2s",
    "author": "wuDDnMxVtk8U9hrueDj/T0itgp5HJZ4ZDEJodTyoMdg=.blake2s",
    "sequence": 17,
    "timestamp": 1419570197975,
    "hash": "blake2s",
    "content": {
      "type": "pub",
      "address": "176.58.117.63"
    },
    "signature": "tbGFP/OSLrOxCjXJqjoGNzkpUmFXI4b4pf5t53REEBopDA6XG8oPphC1r3vYKhCvJuLERB8EhvwOs2GNjaOKUA==.blake2s.k256"
  }
]
```

This has connected to the pub server and used a temporary invite token
to tell it to follow you. Now the server will replicate your data for you.
If you create your own pub server you can give out your own invite codes.


### Running a Pub Server

If you run a pub server - an ordinary machine, except running with
a static ip address - then you can give out your own invite codes
and help support the network.

``` js
# ssh into your server & install scuttlebot

> ssh <user>@<host>
> npm install -g scuttlebot

# run a server like above, but with a public ip, this must be the
# the ip address of the server it's running on. this is my ip,
# yours will be different. (You can use a domain instead of an ip)

> sbot server --host 176.58.117.63

# now in another terminal, create an invitation:

> sbot invite.create 100
"176.58.117.63,TNn7v0MsAs8OpQnyRwtsMeROVWGlKnS/ItX966PAWjI=.blake2s,yCHiB1JfBdIEUZEW/eURMRYe64FTTKuj7+F1p/xDrUc="
```

The number specifies how many times the invite can be used before it expires. Share the code with friends so you can reach each other through your pub.


### CLI usage

Start a server

```
sbot server
```

then issue commands from another terminal...

```
# add a simple message (type is required, but freeform)
sbot add --type post --text "hello world"

# get your id
sbot whoami

# set your nickname
sbot add --type name --name bob

# follow another user
sbot add --type follow --feed <id> --rel follows

# add a pub server (this is a server you'll connect to replicate with)
# (if port is the default, :2000, then that can be leftoff)
sbot add --type pub --address <domain:port>

# read all messages in order received
sbot log
```

## Configuration

There are some configuration options for the sysadmins out there.
All configuration is loaded via [rc](https://github.com/dominictarr/rc)
you can pass any configuration value in as cli arg, env var, or in a file.

Mostly, you will want to edit `~/.ssb/config`
```
{
  //listen on a non-standard port (it's easiest if you stay on 2000)
  port: 2000,
  //disconnect any replication stream after nothing has happened for
  //this many milliseconds
  timeout: 30000,

  //replicate with pub servers
  pub: true,

  //replicate with local servers (discovered on same network via udp)
  local: true,

  //use the local ui (called phoenix)
  phoenix: true,

  //where to keep the database & files (default: next to config file)
  path: ~/.ssb

  //configuration for friends plugin
  friends: {
    //replicate first 150 peers
    dunbar: 150,
    //replicate 3 hops out from yourself.
    hops: 3
  },

  gossip: {
    //how many other nodes to connect with at one time.
    connections: 2
  },

  //if you want to host with a domain, set it here.
  //otherwise, your public ip is auto detected.
  host: <auto detects non-private ip>
}

```

