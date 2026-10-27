#!/usr/bin/env python3
"""Static consistency checks for the independently maintained Home Assistant app."""
import pathlib
import re
import yaml

root = pathlib.Path(__file__).resolve().parents[1]
addon = root / 'opengym'
repo = yaml.safe_load((root / 'repository.yaml').read_text())
config = yaml.safe_load((addon / 'config.yaml').read_text())
build = yaml.safe_load((addon / 'build.yaml').read_text())
docker = (addon / 'Dockerfile').read_text()
nginx = (addon / 'rootfs/etc/nginx/http.d/default.conf').read_text()
run = (addon / 'rootfs/usr/local/bin/start-opengym').read_text()

assert repo['url'] == config['url']
assert config['slug'] == 'opengym'
assert config['ingress'] is True
assert config['ingress_port'] == 8099
assert config.get('ports') == {'8100/tcp': None}, 'Mobile host port must be disabled by default'
translations = yaml.safe_load((addon / 'translations/en.yaml').read_text())
assert '8100/tcp' in translations.get('network', {}), 'Explain mobile API port in HA Network UI'
example = (root / 'examples/nginx/opengym-mobile.conf.example').read_text()
assert 'proxy_pass http://192.0.2.10:8100;' in example
assert 'ssl_certificate ' in example and 'location ^~ /api/' in example
assert 'add_header Access-Control-Allow-Origin' not in example, 'Upstream owns CORS'
assert {'amd64','aarch64'} <= set(config['arch'])
assert set(config['options']) == set(config['schema'])
assert 'data' in [x['type'] for x in config['map']]
assert config['backup'] == 'cold'
assert 'mqtt:want' in config.get('services', [])
assert config['options']['home_assistant_sensors'] is False
assert config['options']['ha_include_bodyweight'] is False
assert 'home_assistant_sensors' in config['schema']
assert (addon/'rootfs/usr/local/lib/opengym-ha/bridge.cjs').exists()
upstream = build['args']['OPENGYM_VERSION']
assert config['version'].startswith(upstream + '-')
assert f'OPENGYM_VERSION={upstream}' in docker
# Build must also succeed when Supervisor supplies Home Assistant's base image,
# which does NOT include Node.js/npm by default.
for arch in ('amd64','aarch64'):
    assert build['build_from'][arch] == 'ghcr.io/home-assistant/base:latest'
assert 'ARG BUILD_FROM=ghcr.io/home-assistant/base:latest' in docker
assert 'apk add --no-cache nodejs npm' in docker
assert 'node --version && npm --version' in docker
assert '8099' in nginx and '8100' in nginx and '127.0.0.1:3000' in nginx
assert 'listen 8100;' in nginx and 'return 404;' in nginx
assert 'EXPOSE 8099 8100' in docker
assert 'api/media/' in nginx and '48m' in nginx
assert 'jq' in docker and 'jq -r' in run
assert 'DATA_DIR=/data/opengym' in run
assert 'FIRST_USER_ADMIN' in run and 'PASSWORD_LOGIN' in run
assert 'COACH_DISABLED' in run
print(f'Valid openGym {config["version"]} (upstream {upstream}), ingress port {config["ingress_port"]}')
