#!/usr/bin/env sh
# Check a running stack end to end: health endpoints, then the owner signing in and out
# through the web app's login form (proving web -> API -> database and the session cookie),
# and using the Shopping list through its forms in between.
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
# form's hidden Server Action fields, add the given fields, post it back to the same URL.
# With FORM set, use the form with that data-testid; otherwise the page's only form.
# Writes the response headers to $WORK/headers.
submit_form() {
  page=$1 session=$2
  shift 2
  curl -fsS --max-time 10 ${session:+-H "Cookie: $COOKIE=$session"} "$page" > "$WORK/page.html" \
    || fail "could not load $page"
  if [ -n "${FORM:-}" ]; then
    tr -d '\n' < "$WORK/page.html" | grep -o "<form[^>]*data-testid=\"$FORM\".*" \
      | sed 's#</form>.*##' > "$WORK/form.html" || fail "no form $FORM on $page"
  else
    cp "$WORK/page.html" "$WORK/form.html"
  fi
  grep -o '<input type="hidden" name="[^"]*"\( value="[^"]*"\)\{0,1\}/>' "$WORK/form.html" \
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
  FRESH_OWNER=1
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
body=$(curl -fsS --max-time 10 -H "Cookie: $COOKIE=$SESSION" "$WEB_URL/wishlist") || fail "web: /wishlist failed"
case $body in *"Coming in a later phase"*) ok "web module placeholder" ;; *) fail "web: /wishlist placeholder missing" ;; esac

[ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SESSION" "$API_URL/auth/me")" = 200 ] \
  || fail "api: /auth/me rejected the web session token"
ok "api accepts the session token"

# Shopping, through the same forms a browser without JavaScript would use. The API (with
# the session token) is the witness for what each form changed.
api_get() { curl -sS --max-time 10 -H "Authorization: Bearer $SESSION" "$API_URL$1"; }

[ "$(curl -sS -o /dev/null -w '%{http_code}' "$API_URL/shopping/items")" = 401 ] \
  || fail "api: /shopping/items must refuse requests without a session"
ok "api refuses shopping requests without a session"

body=$(curl -fsS --max-time 10 -H "Cookie: $COOKIE=$SESSION" "$WEB_URL/shopping") || fail "web: /shopping failed"
case $body in *'data-testid="shopping-list"'*) ok "web shopping page" ;; *) fail "web: /shopping did not show the list" ;; esac
if [ -n "${FRESH_OWNER:-}" ]; then
  case $body in *'data-testid="shopping-empty"'*) ok "web shopping empty state" ;; *) fail "web: a new owner's list should be empty" ;; esac
fi

ITEM="Smoke test milk $(date +%s)"
FORM=add-item-form submit_form "$WEB_URL/shopping" "$SESSION" \
  --form-string "name=$ITEM" --form-string "quantity=2 l" --form-string "notes="
ID=$(api_get /shopping/items | tr '{' '\n' | grep -F "\"name\":\"$ITEM\"" | sed -n 's/^"id":"\([^"]*\)".*/\1/p')
[ -n "$ID" ] || fail "web: adding an item through the form did not create it"
body=$(curl -fsS --max-time 10 -H "Cookie: $COOKIE=$SESSION" "$WEB_URL/shopping") || fail "web: /shopping failed"
case $body in *"$ITEM"*) ok "web adds a shopping item" ;; *) fail "web: the new item is not on the list" ;; esac

FORM="toggle-item-$ID" submit_form "$WEB_URL/shopping" "$SESSION"
case $(api_get "/shopping/items/$ID") in *'"checked":true'*) ok "web checks off an item" ;; *) fail "web: checking off did not stick" ;; esac

FORM=edit-item-form submit_form "$WEB_URL/shopping/$ID/edit" "$SESSION" \
  --form-string "name=$ITEM edited" --form-string "quantity=" --form-string "notes=Oat"
grep -qi "^location: /shopping" "$WORK/headers" || fail "web: saving an edit did not return to /shopping"
case $(api_get "/shopping/items/$ID") in
  *"\"name\":\"$ITEM edited\",\"quantity\":null,\"notes\":\"Oat\""*) ok "web edits an item" ;;
  *) fail "web: the edit was not saved" ;;
esac

FORM="delete-item-$ID" submit_form "$WEB_URL/shopping" "$SESSION"
[ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SESSION" "$API_URL/shopping/items/$ID")" = 404 ] \
  || fail "web: deleting the item did not remove it"
ok "web deletes an item"

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
