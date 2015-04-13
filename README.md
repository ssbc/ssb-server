# Scuttlebot

[![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/ssbc/scuttlebot?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Scuttlebot is a personal server for the SSB distributed network. It includes a database, networking stack, command-line interface, and the phoenix web frontend. Install scuttlebot on your computer to join the network.

Join us in #scuttlebutt on freenode.

[![build status](https://secure.travis-ci.org/ssbc/scuttlebot.png)](http://travis-ci.org/ssbc/scuttlebot)

**What is Secure Scuttlebutt?**

[Secure Scuttlebutt](https://github.com/ssbc/secure-scuttlebutt) (SSB) is a data network designed to replace centralized databases on the Web. It uses cryptographic keypairs to gossip unforgeable user-feeds across the network. "Pub" servers aggregate and redistribute the feeds, but SSB has no central authority: every node is equal, and the network is fully open.

**What is Phoenix?**

[Phoenix](https://github.com/ssbc/phoenix) is the web interface which is bundled with scuttlebot.


### Installing

Set up a local client, join the network, and post messages.
Please post an issue if the following does not work for you.

First install scuttlebot globally:

```
$ npm install -g scuttlebot
```

If this gives you a permissions error, [fix it using the method here (recommended)](http://stackoverflow.com/questions/19352976/npm-modules-wont-install-globally-without-sudo) or install and run scuttlebot using sudo.

Start your local server:

```
$ sbot server
```

Now, in another terminal, issue command:

```
$ sbot whoami
{
  "id": "wuDDnMxVtk8U9hrueDj/T0itgp5HJZ4ZDEJodTyoMdg=.blake2s",
  "public": "vUadxn7OumI4aaHa3FGNQZ+822rsaPvBeJoM4lQ6ayTZcOHlnb0+u41isdwGQv3t3qw//wvFH6JmeHTpJzmO2w==.k256"
}
```

The `whoami` command outputs your id and your public key. There are many other commands listed below.


### Web UI

Once the scuttlebot server is running, you can access the Web UI at `http://localhost:2000`.


### Joining the Network

Scuttlebot will automatically sync with other computers on your wifi. If you want to reach people outside your local network, you have to use a "pub" server - a scuttlebot instance running on a public static IP.

It's easy to [run your own pub server](#running-a-pub-server), but life's easier if you can join an existing pub ([see the informal registry of pub servers](https://github.com/ssbc/scuttlebot/wiki/Pub-Servers)). Ask a pub-owner for an invite, then run the following command. This sends a request to the server and asks it to follow you. You'll see a similar output if you use this command.

```
$ sbot invite.addMe <invite-code>

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

Ssh into your server and install scuttlebot:

```
$ ssh <user>@<host>
$ npm install -g scuttlebot
```

Run a server like above but with the public ip address of the computer it's running on (using a domain name is also fine):

```
$ sbot server --host 176.58.117.63
```

In another terminal, create an invitation:

```
$ sbot invite.create 100
"176.58.117.63,TNn7v0MsAs8OpQnyRwtsMeROVWGlKnS/ItX966PAWjI=.blake2s,yCHiB1JfBdIEUZEW/eURMRYe64FTTKuj7+F1p/xDrUc="
```

The number specifies how many times the invite can be used before it expires. Share the code with friends so you can reach each other through your pub.

### Control your pub server remotely

Using `ssh` to manage your pub server can be a pain. Instead you can configure it to do whatever your local key asks.

Add a property to your config file (create one at `~/.ssb/config`) if it does not exist.

``` js
"master": <your_id>,
```

To get your id, use `whoami` command on your local instance.
If you would like to have more than one remote master, set master
to an array of ids.

Restart your pub server, and now issue commands from your local computer,

```
$ ssb_host=<pub_ip> sbot whoami
{ "id": <pub server's id>, "public": <pub server's pubkey>}
```

### CLI usage

Start a server

```
$ sbot server
```

Then issue commands from another terminal.

Add a simple message (type is required, but freeform):

```
$ sbot publish --type post --text "hello world"
```

Get your id:

```
$ sbot whoami
```

Set your nickname:

```
$ sbot publish --type name --name bob
```

Follow another user:

```
$ sbot publish --type follow --feed <id> --rel follows
```

Add a pub server (this is a server you'll connect to replicate with)
(if port is the default, :8008, then that can be leftoff):

```
$ sbot publish --type pub --address <domain:port>
```

Read all messages in order received:

```
$ sbot log
```

## Configuration

Default configuration should be fine. If you want to know about the details and advanced usage please have a look at [`ssb-config`](https://github.com/ssbc/ssb-config).
