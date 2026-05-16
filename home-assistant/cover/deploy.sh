#!/usr/bin/env bash
# Deploy the garage-cover package YAML. Pushes the file with scp -O, validates
# with `ha core check`, then reloads helpers/template/automation by calling
# the supervisor proxy from inside addon_core_configurator (whose
# SUPERVISOR_TOKEN carries the homeassistant_api permission). No HA_TOKEN
# required.
#
# Requires: `ssh ha` and `scp -O` working, and the File Editor
# (core_configurator) addon installed on HA.

set -euo pipefail
cd "$(dirname "$0")"

echo "==> Backing up to /tmp/garage_cover.yaml.previous"
ssh ha 'cp /mnt/data/supervisor/homeassistant/packages/garage_cover.yaml /tmp/garage_cover.yaml.previous'

echo "==> Pushing garage_cover.yaml"
scp -O -q garage_cover.yaml ha:/mnt/data/supervisor/homeassistant/packages/garage_cover.yaml

echo "==> ha core check"
ssh ha 'ha core check'

echo "==> Reloading input_select, timer, template, automation"
ssh ha 'docker exec addon_core_configurator sh -c "
  set -e
  for service in input_select timer template automation; do
    curl --silent --show-error --fail-with-body \
      -X POST \
      -H \"Authorization: Bearer \$SUPERVISOR_TOKEN\" \
      -H \"Content-Type: application/json\" \
      \"http://supervisor/core/api/services/\$service/reload\" \
      --data \"{}\" > /dev/null
    sleep 0.4
  done
"'

echo '==> Done. Recovery: ssh ha "cp /tmp/garage_cover.yaml.previous /mnt/data/supervisor/homeassistant/packages/garage_cover.yaml" and re-run.'
