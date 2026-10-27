# syntax=docker/dockerfile:1
# Both upstream images are pinned to the same published release.
ARG BUILD_FROM=ghcr.io/home-assistant/base:latest
ARG OPENGYM_VERSION=1.4.3
FROM ghcr.io/duartesantos8/opengym-api:${OPENGYM_VERSION} AS api
FROM ghcr.io/duartesantos8/opengym-web:${OPENGYM_VERSION} AS web
FROM ${BUILD_FROM}
# Supervisor supplies ghcr.io/home-assistant/base as BUILD_FROM; unlike the
# node:alpine image used by earlier CI, this image does not include node/npm.
# Both node and npm are needed: node runs the API and MQTT bridge, while npm
# installs the pinned MQTT dependency below.
RUN apk add --no-cache nodejs npm nginx tini curl jq \
    && mkdir -p /run/nginx /data/opengym /usr/share/nginx/html \
    && adduser -D -H -s /sbin/nologin coach
# Install a standalone, pinned MQTT client without modifying upstream API dependencies.
RUN node --version && npm --version && \
    mkdir -p /opt/opengym-mqtt && \
    npm install --prefix /opt/opengym-mqtt --omit=dev --no-audit --no-fund --save-exact mqtt@5.15.2
WORKDIR /app
COPY --from=api /app/ /app/
COPY --from=web /usr/share/nginx/html/ /usr/share/nginx/html/
COPY rootfs/ /
RUN chmod 0755 /usr/local/bin/start-opengym && nginx -t
EXPOSE 8099 8100
HEALTHCHECK --interval=60s --timeout=10s --retries=3 CMD curl -fsS http://127.0.0.1:8099/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/start-opengym"]
