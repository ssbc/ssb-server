#! /usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const fs_1 = require("fs");
const path = require("path");
const pull = require("pull-stream");
const toPull = require("stream-to-pull-stream");
const File = require("pull-file");
const explain = require("explain-error");
const Config = require("ssb-config/inject");
const Client = require("ssb-client");
const minimist = require("minimist");
const muxrpcli = require("muxrpcli");
const cli_cmd_aliases_1 = require("./cli/cli-cmd-aliases");
const progress_1 = require("./cli/progress");
// TODO: Fix cross-os path.
const packageJson = JSON.parse((0, fs_1.readFileSync)(path.resolve(__dirname, '../package.json'), 'utf-8'));
//get config as cli options after --, options before that are
//options to the command.
var argv = process.argv.slice(2);
var i = argv.indexOf('--');
var conf = argv.slice(i + 1);
argv = ~i ? argv.slice(0, i) : argv;
var config = Config(process.env.ssb_appname, minimist(conf));
if (config.keys.curve === 'k256')
    throw new Error('k256 curves are no longer supported,' +
        'please delete' + path.join(config.path, 'secret'));
var manifestFile = path.join(config.path, 'manifest.json');
if (argv[0] == 'server') {
    console.log('WARNING-DEPRECATION: `sbot server` has been renamed to `ssb-server start`');
    argv[0] = 'start';
}
if (argv[0] == 'start') {
    console.log(packageJson.name, packageJson.version, config.path, 'logging.level:' + config.logging.level);
    console.log('my key ID:', config.keys.public);
    // special start command:
    // import ssbServer and start the server
    const serverFactory = (new index_1.SSBServerFactory)
        .use(require('ssb-private1'))
        .use(require('ssb-onion'))
        .use(require('ssb-unix-socket'))
        .use(require('ssb-no-auth'))
        .use(require('ssb-plugins'))
        .use(require('ssb-master'))
        .use(require('ssb-gossip'))
        .use(require('ssb-replicate'))
        .use(require('ssb-friends'))
        .use(require('ssb-blobs'))
        .use(require('ssb-invite'))
        .use(require('ssb-local'))
        .use(require('ssb-logging'))
        .use(require('ssb-query'))
        .use(require('ssb-links'))
        .use(require('ssb-ws'))
        .use(require('ssb-ebt'))
        .use(require('ssb-ooo'));
    // add third-party plugins
    require('ssb-plugins').loadUserPlugins(serverFactory, config);
    // start server
    var server = serverFactory.create(config);
    // write RPC manifest to ~/.ssb/manifest.json
    (0, fs_1.writeFileSync)(manifestFile, JSON.stringify(server.getManifest(), null, 2));
    if (process.stdout.isTTY && (config.logging.level != 'info'))
        (0, progress_1.default)(server.progress);
}
else {
    // normal command:
    // create a client connection to the server
    // read manifest.json
    var manifest;
    try {
        manifest = JSON.parse((0, fs_1.readFileSync)(manifestFile, 'utf-8'));
    }
    catch (err) {
        throw explain(err, 'no manifest file'
            + '- should be generated first time server is run');
    }
    var opts = {
        manifest: manifest,
        port: config.port,
        host: config.host || 'localhost',
        caps: config.caps,
        key: config.key || config.keys.id
    };
    // connect
    Client(config.keys, opts, function (err, rpc) {
        if (err) {
            if (/could not connect/.test(err.message)) {
                console.error('Error: Could not connect to ssb-server ' + opts.host + ':' + opts.port);
                console.error('Use the "start" command to start it.');
                console.error('Use --verbose option to see full error');
                if (config.verbose)
                    throw err;
                process.exit(1);
            }
            throw err;
        }
        // add aliases
        for (var k in cli_cmd_aliases_1.default) {
            rpc[k] = rpc[cli_cmd_aliases_1.default[k]];
            manifest[k] = manifest[cli_cmd_aliases_1.default[k]];
        }
        // add some extra commands
        //    manifest.version = 'async'
        manifest.config = 'sync';
        //    rpc.version = function (cb) {
        //      console.log(packageJson.version)
        //      cb()
        //    }
        rpc.config = function (cb) {
            console.log(JSON.stringify(config, null, 2));
            cb();
        };
        if (process.argv[2] === 'blobs.add') {
            var filename = process.argv[3];
            var source = filename ? File(process.argv[3])
                : !process.stdin.isTTY ? toPull.source(process.stdin)
                    : (function () {
                        console.error('USAGE:');
                        console.error('  blobs.add <filename> # add a file');
                        console.error('  source | blobs.add   # read from stdin');
                        process.exit(1);
                    })();
            pull(source, rpc.blobs.add(function (err, hash) {
                if (err)
                    throw err;
                console.log(hash);
                process.exit();
            }));
            return;
        }
        // run commandline flow
        muxrpcli(argv, manifest, rpc, config.verbose);
    });
}
//# sourceMappingURL=main.js.map