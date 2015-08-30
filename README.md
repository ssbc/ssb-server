# Scuttlebot

Scuttlebot is a personal server for the SSB distributed network. It includes a database, networking stack, command-line interface, and the phoenix web frontend. Install scuttlebot on your computer to join the network.

Join us in #scuttlebutt on freenode.

[![build status](https://secure.travis-ci.org/ssbc/scuttlebot.png)](http://travis-ci.org/ssbc/scuttlebot)

**What is Secure Scuttlebutt?**

[Secure Scuttlebutt](https://github.com/ssbc/secure-scuttlebutt) (SSB) is a data network designed to replace centralized databases on the Web. It uses cryptographic keypairs to gossip unforgeable user-feeds across the network. "Pub" servers aggregate and redistribute the feeds, but SSB has no central authority: every node is equal, and the network is fully open.

**What is Phoenix?**

[Phoenix](https://github.com/ssbc/phoenix) is the web interface which is bundled with scuttlebot.


### Documentation/wiki/FAQ

[documentation is here](https://github.com/ssbc/ssb-docs)
We have shifted documentation from a github wiki to a repo,
which means you can ask make pull requests, get notifications,
ask questions in issues. If you have questions or get confused
please post an issue!

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
  "id": "@YO7Tam6MnFNmghJa1K8K1VFHErjMrD3jpS1ilyYCrX8=.ed25519"
}
```

The `whoami` command outputs your id and your public key. There are many other commands listed below.


### Web UI

Once the scuttlebot server is running, you can access the Web UI at `http://localhost:8008`.


### Joining the Network

Scuttlebot will automatically sync with other computers on your wifi. If you want to reach people outside your local network, you have to use a "pub" server - a scuttlebot instance running on a public static IP.

It's easy to [run your own pub server](#running-a-pub-server), but life's easier if you can join an existing pub ([see the informal registry of pub servers](https://github.com/ssbc/scuttlebot/wiki/Pub-Servers)). Ask a pub-owner for an invite, then run the following command. This sends a request to the server and asks it to follow you. You'll see a similar output if you use this command.

```
$ sbot invite.accept <code>
[
  {
    "key": "%v3hE0SUwT9QA0X1pHdFPD63q8YEiWmo6PCavotZI1x8=.sha256",
    "value": {
      "previous": null,
      "author": "@p10R76tYs0fxqugpqrNj5/hQwThUMfMmxF9gFVzEARg=.ed25519",
      "sequence": 1,
      "timestamp": 1440608903230,
      "hash": "sha256",
      "content": {
        "type": "contact",
        "following": true,
        "autofollow": true,
        "contact": "@J+0DGLgRn8H5tVLCcRUfN7NfUcTGEZKqML3krEOJjDY=.ed25519"
      },
      "signature": "eFXsAQ/Ve/HCr1RKClNul2bl1txXuvLDbWJIIyeiz5g/sC/j4TbHCASTc6+AWUtprnH5LftFOV4KbxdiqmCMAg==.sig.ed25519"
    }
  },
  {
    "key": "%dmnkEgD5EwuthpAEkkx3dmRD9B2m0S8Nzg5Q5QX+c3I=.sha256",
    "value": {
      "previous": "%v3hE0SUwT9QA0X1pHdFPD63q8YEiWmo6PCavotZI1x8=.sha256",
      "author": "@p10R76tYs0fxqugpqrNj5/hQwThUMfMmxF9gFVzEARg=.ed25519",
      "sequence": 2,
      "timestamp": 1440608903248,
      "hash": "sha256",
      "content": {
        "type": "pub",
        "address": {
          "host": "176.58.117.63",
          "port": 8008,
          "key": "@J+0DGLgRn8H5tVLCcRUfN7NfUcTGEZKqML3krEOJjDY=.ed25519"
        }
      },
      "signature": "UL9HKRtESBrPqdHPiWY8Bj9e7N5kNlCnLw1t1Ur9C5/UQSdNW16hutuA/VaVW6+xina+8Hyu4IyhZchBxvQbBA==.sig.ed25519"
    }
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

Run a server!
```
$ sbot server
```
You need to run it on a server that has a static ip address but this will be automatically detected by sbot. If it is not automatically detected, then you may set the host manually using `--host <ip>`. You can use a domain, but an ip address is preferred because that is more decentralized (no dependency on DNS) 


Open another terminal on the *same server*:

```
$ sbot invite.create 100
"176.58.117.63,TNn7v0MsAs8OpQnyRwtsMeROVWGlKnS/ItX966PAWjI=.blake2s,yCHiB1JfBdIEUZEW/eURMRYe64FTTKuj7+F1p/xDrUc="
```

The number specifies how many times the invite can be used before it expires. Your friends may use `sbot invite.accept` with the code (or "join a pubserver" button on patchwork).

<!--
//Commenting out this section because it is not true.
//these instructions do not work anymore because you also need the pubkey of the server.
//I think we need a better way to specify what server to connect to
//because passing the pub key in via envvar isn't realistic.
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
-->
### CLI usage

Start a server

```
$ sbot server
```

Then issue commands from another terminal.

Add a simple message (type is required, but can be any string between 3 and 54 chars long):

```
$ sbot publish --type post --text "hello world"
```

Get your id:

```
$ sbot whoami
```

Set your nickname:

```
$ sbot publish --type contact --name <name> --contact <your_id>
```

Follow another user:

```
$ sbot publish --type contact --following --contact <id>
```

Get the address of a server.

```
$ sbot getAddress
"192.168.43.88:8008:@p10R76tYs0fxqugpqrNj5/hQwThUMfMmxF9gFVzEARg=.ed25519"
```

Add a pub server (this is a server you'll connect to replicate with):
```
$ sbot publish --type pub --address <ip:port:key>
```

Read all messages in order received:
```
$ sbot log
```

Read all messages by their type field (try "post" or "contact")

```
$ sbot messageByType <type>
```

## Configuration

Default configuration should be fine. If you want to know about the details and advanced usage please have a look at [`ssb-config`](https://github.com/ssbc/ssb-config).
