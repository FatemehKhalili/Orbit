#!/usr/bin/env sh
# Check a running stack end to end: API liveness and readiness, web liveness, and that
# the web page reports the backend as online (proving web -> API -> database works).
# Usage: ./scripts/smoke-test.sh   (after `docker compose up`)
set -eu

API_URL=${API_URL:-http://localhost:${API_PORT:-8000}}
WEB_URL=${WEB_URL:-http://localhost:${WEB_PORT:-3000}}

check() {
  name=$1 url=$2 expected=$3
  body=$(curl -fsS --max-time 10 "$url") || { echo "FAIL $name: $url did not respond with 2xx" >&2; exit 1; }
  case $body in
    *"$expected"*) echo "ok   $name" ;;
    *) echo "FAIL $name: expected '$expected' in response from $url" >&2; exit 1 ;;
  esac
}

check "api liveness"       "$API_URL/health"       '"status":"ok"'
check "api readiness"      "$API_URL/health/ready" '"database":"ok"'
check "web liveness"       "$WEB_URL/api/health"   '"service":"orbit-web"'
check "web sees backend"   "$WEB_URL/"             'Online'
echo "All smoke checks passed."
