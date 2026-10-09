#!/usr/bin/env bash
# Both entry points always build fresh production output before uploading.
set -euo pipefail
exec "$(dirname "$0")/infra/deploy.sh" "$@"
