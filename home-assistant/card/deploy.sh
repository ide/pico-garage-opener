#!/usr/bin/env bash
# Deploy the garage-cover button-card to lovelace-home. Runs tests, builds
# cover-card.generated.yaml, then pushes via the supervisor's WebSocket
# proxy. Auth comes from SUPERVISOR_TOKEN inside addon_core_configurator
# (whose token has the homeassistant_api permission); the token is written
# to a temp file on the HA host and consumed there so it never appears
# unescaped in an ssh command line. No HA_TOKEN required on this machine.
#
# Requires: `ssh ha` and `scp -O` working, local python3 with PyYAML, and
# the File Editor (core_configurator) addon installed on HA.

set -euo pipefail
cd "$(dirname "$0")"

echo "==> Tests"
node --test cover-card.test.js

echo "==> Build"
node build-card.mjs

echo "==> YAML → JSON"
python3 -c "
import json, yaml
print(json.dumps(yaml.safe_load(open('cover-card.generated.yaml'))))
" > /tmp/garage-card.json

echo "==> Fetching SUPERVISOR_TOKEN from addon_core_configurator"
TOKEN=$(ssh ha 'docker exec addon_core_configurator printenv SUPERVISOR_TOKEN' | tr -d '\r\n')
if [[ -z "$TOKEN" ]]; then
  echo "Failed to extract SUPERVISOR_TOKEN from addon_core_configurator container." >&2
  echo "The File Editor (core_configurator) addon must be installed; its token has" >&2
  echo "the homeassistant_api permission we need to reach the lovelace WebSocket." >&2
  exit 1
fi

trap 'ssh ha "rm -f /tmp/garage_supervisor_token /tmp/deploy_card.py"' EXIT

echo "==> Staging token and deploy_card.py onto the HA host"
printf '%s' "$TOKEN" | ssh ha 'umask 077 && cat > /tmp/garage_supervisor_token'
scp -O -q deploy_card.py ha:/tmp/deploy_card.py
ssh ha 'docker cp /tmp/deploy_card.py hassio_supervisor:/tmp/deploy_card.py'

echo "==> Pushing card config via supervisor proxy"
ssh ha 'docker exec -i -e SUPERVISOR_TOKEN="$(cat /tmp/garage_supervisor_token)" hassio_supervisor python3 /tmp/deploy_card.py' < /tmp/garage-card.json

echo "==> Done"
