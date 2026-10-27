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
assert not config.get('ports'), 'Ingress-only addon must not expose host ports'
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
assert '8099' in nginx and '127.0.0.1:3000' in nginx
assert 'api/media/' in nginx and '48m' in nginx
assert 'jq' in docker and 'jq -r' in run
assert 'DATA_DIR=/data/opengym' in run
assert 'FIRST_USER_ADMIN' in run and 'PASSWORD_LOGIN' in run
assert 'COACH_DISABLED' in run
print(f'Valid openGym {config["version"]} (upstream {upstream}), ingress port {config["ingress_port"]}')
