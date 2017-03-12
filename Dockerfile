# To build:
#    docker build -t sbot .
#
# The following allows you to start the server:
#    docker run -it --rm --port 8008:8008 sbot sbot server
#
# To start an isolated network, run many times the following (no ports, exposed):
#     docker run -it --rm sbot sbot server
# You may also need to use the first command (only once)
#
# To get a shell:
#     docker run -it --rm sbot
#
# You may also need to use "docker stop sbot" to stop the container(s)

FROM node:alpine
MAINTAINER DeveloppSoft

USER root

RUN apk update
RUN apk add python python-dev alpine-sdk libsodium-dev libsodium

RUN npm install scuttlebot@latest -g
RUN npm install secure-scuttlebutt -g

# Install plugins
RUN npm install ssb-links ssb-query ssb-ws ssb-fulltext

CMD /bin/ash
