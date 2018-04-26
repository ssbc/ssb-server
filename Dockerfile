FROM node:8

# root
WORKDIR /app

# we don't want dev dependencies
ENV NODE_ENV production

# add package.json first so that packages are cached
ADD package*.json /app/
RUN npm install

# add the rest
ADD . /app

# link the "scuttlebot" binary
RUN npm link

# entrypoint is scuttlebot
# ENTRYPOINT ["/app/bin.js"]

# work in an empty directory so it can be mounted externally
WORKDIR /data

# easiest way to change SSB root directory
RUN ln -s /data /root/.ssb

# default cmd is server, that's what we want 99% of the time
CMD /app/bin.js server
