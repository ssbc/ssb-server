with import <nixpkgs> {};
with pkgs;

let ssbScuttlebotEnv = buildEnv {
  name = "scuttlebot";
  paths = [
    atk
    binutils
    bzip2
    dbus.lib
    expat
    gcc
    glib
    glibc
    gnumake
    libcap
    libgpgerror
    libnotify
    libsodium
    nspr
    nss
    readline
    systemd
    udev
    zlib
  ];
  extraOutputsToInstall = [ "lib" "dev" "out" ];
}; in

(pkgs.buildFHSUserEnv {
  name = "Scuttlebot";

  targetPkgs = pkgs: (with pkgs; [
    nodejs-8_x
    xvfb_run
    unzip
    git
    ssbScuttlebotEnv
  ]);

  extraOutputsToInstall = [ "lib" "dev" "out" ];

  extraBuildCommands = ''
    (cd usr/lib64 && ln -sv libbz2.so.1.0.* libbz2.so.1.0)
  '';

  profile = ''
    export npm_config_cache="/tmp/ssbScuttlebot-npm-cache/"
    export npm_config_devdir="/tmp/ssbScuttlebot-gyp/"
    export ELECTRON_CACHE="/tmp/ssbScuttlebot-electron-cache/"

    export CFLAGS="$NIX_CFLAGS_COMPILE"
    export CXXFLAGS="$NIX_CFLAGS_COMPILE"
    export LDFLAGS="$NIX_LDFLAGS_BEFORE"
  '';
}).env

