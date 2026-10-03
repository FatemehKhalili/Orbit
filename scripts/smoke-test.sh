#!/usr/bin/env sh
# Check a running stack end to end: health endpoints, then the owner signing in and out
# through the web app's login form (proving web -> API -> database and the session cookie).
# Usage: ./scripts/smoke-test.sh   (after `docker compose up`)
#
# Signing in needs an owner. With ORBIT_SMOKE_EMAIL and ORBIT_SMOKE_PASSWORD set, the
# script uses that account. Otherwise it creates a throwaway owner through Docker Compose,
# which only works on an instance that has no owner yet (a fresh database, as in CI).
set -eu

API_URL=${API_URL:-http://localhost:${API_PORT:-8000}}
WEB_URL=${WEB_URL:-http://localhost:${WEB_PORT:-3000}}
COOKIE=orbit_session

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

fail() { echo "FAIL $*" >&2; exit 1; }
ok() { echo "ok   $1"; }

check() {
  name=$1 url=$2 expected=$3
  body=$(curl -fsS --max-time 10 "$url") || fail "$name: $url did not respond with 2xx"
  case $body in
    *"$expected"*) ok "$name" ;;
    *) fail "$name: expected '$expected' in response from $url" ;;
  esac
}

# Fetch a page as the given session (may be empty) and print "<status> <redirect target>".
status_of() {
  curl -sS -o /dev/null --max-time 10 -w '%{http_code} %{redirect_url}' \
    ${2:+-H "Cookie: $COOKIE=$2"} "$1"
}

# Submit the form on a web page the way a browser without JavaScript would: copy the
# page's hidden Server Action fields, add the given fields, post it back to the same URL.
# Writes the response headers to $WORK/headers.
submit_form() {
  page=$1 session=$2
  shift 2
  curl -fsS --max-time 10 ${session:+-H "Cookie: $COOKIE=$session"} "$page" > "$WORK/page.html" \
    || fail "could not load $page"
  grep -o '<input type="hidden" name="[^"]*"\( value="[^"]*"\)\{0,1\}/>' "$WORK/page.html" \
    | sed -e 's/<input type="hidden" name="\([^"]*\)"\( value="\(.*\)"\)\{0,1\}\/>/\1=\3/' \
          -e 's/&quot;/"/g' -e 's/&amp;/\&/g' > "$WORK/fields"
  [ -s "$WORK/fields" ] || fail "no form found on $page"
  while IFS= read -r field; do set -- "$@" --form-string "$field"; done < "$WORK/fields"
  curl -sS -o /dev/null --max-time 15 -D "$WORK/headers" -H "Origin: ${ORIGIN:-$WEB_URL}" \
    ${session:+-H "Cookie: $COOKIE=$session"} "$@" "$page"
}

session_from_headers() {
  sed -n "s/^[Ss]et-[Cc]ookie: $COOKIE=\([^;]*\).*/\1/p" "$WORK/headers" | tr -d '\r' | tail -n 1
}

check "api liveness"       "$API_URL/health"       '"status":"ok"'
check "api readiness"      "$API_URL/health/ready" '"database":"ok"'
check "web liveness"       "$WEB_URL/api/health"   '"service":"orbit-web"'

case $(status_of "$WEB_URL/") in
  "307 "*/login) ok "web sends visitors without a session to /login" ;;
  *) fail "web: / without a session should redirect to /login" ;;
esac
check "web login page"     "$WEB_URL/login"        'Sign in'

if [ -z "${ORBIT_SMOKE_EMAIL:-}" ]; then
  ORBIT_SMOKE_EMAIL="smoke-$(date +%s)@example.com"
  ORBIT_SMOKE_PASSWORD="smoke-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
  printf '%s\n' "$ORBIT_SMOKE_PASSWORD" \
    | docker compose exec -T api python -m app.cli create-owner \
        --email "$ORBIT_SMOKE_EMAIL" --name "Smoke Test" --password-stdin > /dev/null \
    || fail "could not create a throwaway owner; on an instance that already has one, set ORBIT_SMOKE_EMAIL and ORBIT_SMOKE_PASSWORD"
  ok "created throwaway owner"
fi

ORIGIN=https://attacker.example submit_form "$WEB_URL/login" "" \
  --form-string "email=$ORBIT_SMOKE_EMAIL" --form-string "password=$ORBIT_SMOKE_PASSWORD" || true
[ -z "$(session_from_headers)" ] || fail "web: a cross-site login post must not set a session"
ok "web refuses a cross-site login post"

submit_form "$WEB_URL/login" "" \
  --form-string "email=$ORBIT_SMOKE_EMAIL" --form-string "password=wrong-$ORBIT_SMOKE_PASSWORD"
[ -z "$(session_from_headers)" ] || fail "web: a wrong password must not set a session"
ok "web rejects a wrong password"

submit_form "$WEB_URL/login" "" \
  --form-string "email=$ORBIT_SMOKE_EMAIL" --form-string "password=$ORBIT_SMOKE_PASSWORD"
SESSION=$(session_from_headers)
[ -n "$SESSION" ] || fail "web: signing in did not set the $COOKIE cookie"
grep -qi "^set-cookie: $COOKIE=.*httponly" "$WORK/headers" || fail "web: session cookie is not HttpOnly"
ok "web sign-in sets an HttpOnly session cookie"

body=$(curl -fsS --max-time 10 -H "Cookie: $COOKIE=$SESSION" "$WEB_URL/") || fail "web: dashboard failed"
case $body in *Online*) ok "web dashboard sees backend online" ;; *) fail "web: dashboard did not show the backend as Online" ;; esac
case $body in *'data-testid="current-user"'*) ok "web shows the signed-in owner" ;; *) fail "web: no signed-in owner on the dashboard" ;; esac
body=$(curl -fsS --max-time 10 -H "Cookie: $COOKIE=$SESSION" "$WEB_URL/shopping") || fail "web: /shopping failed"
case $body in *"Coming in a later phase"*) ok "web module placeholder" ;; *) fail "web: /shopping placeholder missing" ;; esac

[ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SESSION" "$API_URL/auth/me")" = 200 ] \
  || fail "api: /auth/me rejected the web session token"
ok "api accepts the session token"

submit_form "$WEB_URL/" "$SESSION"
grep -qi "^location: /login" "$WORK/headers" || fail "web: signing out did not redirect to /login"
ok "web sign-out"

[ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SESSION" "$API_URL/auth/me")" = 401 ] \
  || fail "api: the session still works after signing out"
ok "api revoked the session on sign-out"
case $(status_of "$WEB_URL/" "$SESSION") in
  "307 "*/login) ok "web sends a revoked session to /login" ;;
  *) fail "web: a revoked session should be redirected to /login" ;;
esac

echo "All smoke checks passed."
