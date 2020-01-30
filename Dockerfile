FROM node:10

USER root
ARG TINI_SUFFIX
ADD https://github.com/krallin/tini/releases/download/v0.18.0/tini${TINI_SUFFIX} /tini
RUN chmod +x /tini
RUN mkdir /home/node/.npm-global ; \
    chown -R node:node /home/node/
ENV PATH=/home/node/.npm-global/bin:$PATH
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global

USER node
RUN npm install -g ssb-server

EXPOSE 8008
VOLUME /home/node/.ssb

HEALTHCHECK --interval=30s --timeout=30s --start-period=10s --retries=10 \
  CMD ssb-server status --host 127.0.0.1 || exit 1
ENV HEALING_ACTION RESTART

ENTRYPOINT [ "/tini", "--", "ssb-server" ]
CMD [ "start" ]
