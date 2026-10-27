# syntax=docker/dockerfile:1
# Both upstream images are pinned to the same published release.
ARG BUILD_FROM=node:22.23.4-alpine
ARG OPENGYM_VERSION=1.4.3
FROM ghcr.io/duartesantos8/opengym-api:${OPENGYM_VERSION} AS api
FROM ghcr.io/duartesantos8/opengym-web:${OPENGYM_VERSION} AS web
FROM ${BUILD_FROM}
RUN apk add --no-cache nginx tini curl jq \
    && mkdir -p /run/nginx /data/opengym /usr/share/nginx/html \
    && adduser -D -H -s /sbin/nologin coach
WORKDIR /app
COPY --from=api /app/ /app/
COPY --from=web /usr/share/nginx/html/ /usr/share/nginx/html/
COPY rootfs/ /
RUN chmod 0755 /usr/local/bin/start-opengym && nginx -t
EXPOSE 8099
HEALTHCHECK --interval=60s --timeout=10s --retries=3 CMD curl -fsS http://127.0.0.1:8099/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/start-opengym"]
