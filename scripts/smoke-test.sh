#!/usr/bin/env sh
# Check a running stack end to end: health endpoints, then the owner signing in and out
# through the web app's login form (proving web -> API -> database and the session cookie),
# and using the Shopping list, Habits and the Calendar through their forms in between.
# Usage: ./scripts/smoke-test.sh   (after `docker compose up`)
#
# For the production stack, point Compose at it (COMPOSE_FILE=compose.production.yml plus
# an override that publishes the API, as CI does). With WEB_URL on https://, the cookies
# must also be Secure.
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

curl -fsS -o /dev/null -D "$WORK/headers" --max-time 10 "$WEB_URL/login" || fail "web: /login failed"
for header in "x-content-type-options: nosniff" "x-frame-options: deny" "referrer-policy: same-origin"; do
  tr -d '\r' < "$WORK/headers" | grep -qix "$header" || fail "web: missing header '$header'"
done
! grep -qi "^x-powered-by:" "$WORK/headers" || fail "web: announces x-powered-by"
ok "web sends security headers"

case $(status_of "$WEB_URL/account/export") in
  "307 "*/login) ok "web export needs a session" ;;
  *) fail "web: /account/export without a session should redirect to /login" ;;
esac

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
grep -qi "^set-cookie: orbit_device=.*httponly" "$WORK/headers" \
  || fail "web: signing in did not remember this browser (orbit_device cookie)"
ok "web sign-in remembers the browser (ADR 0010)"
case $WEB_URL in
  https://*)
    for name in "$COOKIE" orbit_device; do
      grep -qi "^set-cookie: $name=.*; secure" "$WORK/headers" || fail "web: $name cookie is not Secure over HTTPS"
    done
    ok "web cookies are Secure over HTTPS"
    ;;
esac

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

# The Dashboard lists the first five unchecked items. On a fresh owner the new item is
# one of them; an existing owner may already have five, and then this check is skipped.
body=$(curl -fsS --max-time 10 -H "Cookie: $COOKIE=$SESSION" "$WEB_URL/") || fail "web: dashboard failed"
case $body in
  *"data-testid=\"dashboard-toggle-item-$ID\""*)
    FORM="dashboard-toggle-item-$ID" submit_form "$WEB_URL/" "$SESSION"
    case $(api_get "/shopping/items/$ID") in *'"checked":true'*) ;; *) fail "web: checking off from the dashboard did not stick" ;; esac
    body=$(curl -fsS --max-time 10 -H "Cookie: $COOKIE=$SESSION" "$WEB_URL/") || fail "web: dashboard failed"
    case $body in *"data-item-id=\"$ID\""*) fail "web: a bought item is still on the dashboard after a reload" ;; esac
    ok "web checks off an item from the dashboard, and it stays off after a reload"
    curl -fsS -o /dev/null --max-time 10 -X PATCH -H "Authorization: Bearer $SESSION" \
      -H "Content-Type: application/json" -d '{"checked":false}' "$API_URL/shopping/items/$ID" \
      || fail "api: could not un-check the smoke test item"
    ;;
  *)
    [ -z "${FRESH_OWNER:-}" ] || fail "web: the new item is not on the dashboard"
    ok "web dashboard check-off skipped (five other items come first)"
    ;;
esac

curl -fsS -D "$WORK/headers" -o "$WORK/export.json" --max-time 30 -H "Cookie: $COOKIE=$SESSION" \
  "$WEB_URL/account/export" || fail "web: /account/export failed"
grep -q '"format":"orbit-export"' "$WORK/export.json" || fail "web: the export is not an Orbit export"
grep -qF "$ITEM" "$WORK/export.json" || fail "web: the export does not hold the new item"
! grep -qiE "password|argon2|$SESSION" "$WORK/export.json" || fail "web: the export holds a secret"
tr -d '\r' < "$WORK/headers" | grep -qix "cache-control: no-store" || fail "web: the export may be cached"
grep -qi '^content-disposition: attachment; filename="orbit-export-' "$WORK/headers" \
  || fail "web: the export is not a file download"
ok "web downloads the owner's export"

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

# Habits, through the same forms. "Today" is whatever the API says it is, in the
# instance timezone (ADR 0008), so the script asks /time rather than its own clock.
[ "$(curl -sS -o /dev/null -w '%{http_code}' "$API_URL/habits/habits")" = 401 ] \
  || fail "api: /habits/habits must refuse requests without a session"
ok "api refuses habit requests without a session"

TODAY=$(api_get /time | sed -n 's/.*"today":"\([0-9-]*\)".*/\1/p')
[ -n "$TODAY" ] || fail "api: /time did not report today's date"
ok "api reports today as $TODAY"

body=$(curl -fsS --max-time 10 -H "Cookie: $COOKIE=$SESSION" "$WEB_URL/habits") || fail "web: /habits failed"
case $body in *'data-testid="habit-list"'*) ok "web habits page" ;; *) fail "web: /habits did not show the list" ;; esac

HABIT="Smoke test reading $(date +%s)"
FORM=add-habit-form submit_form "$WEB_URL/habits" "$SESSION" \
  --form-string "name=$HABIT" --form-string "notes="
HID=$(api_get /habits/habits | tr '{' '\n' | grep -F "\"name\":\"$HABIT\"" | sed -n 's/^"id":"\([^"]*\)".*/\1/p')
[ -n "$HID" ] || fail "web: adding a habit through the form did not create it"
ok "web adds a habit"

# Today from the Dashboard: every active habit is listed there.
FORM="dashboard-check-in-$HID" submit_form "$WEB_URL/" "$SESSION"
case $(api_get "/habits/habits/$HID") in *"\"check_ins\":[\"$TODAY\"]"*) ;; *) fail "web: checking off today from the dashboard did not stick" ;; esac
body=$(curl -fsS --max-time 10 -H "Cookie: $COOKIE=$SESSION" "$WEB_URL/") || fail "web: dashboard failed"
case $body in *"data-habit-id=\"$HID\" data-done=\"true\""*) ;; *) fail "web: the dashboard does not show the habit done after a reload" ;; esac
if [ -n "${FRESH_OWNER:-}" ]; then
  case $body in *"1 of 1"*) ;; *) fail "web: the dashboard's habit count did not update" ;; esac
fi
ok "web checks off today from the dashboard, and it stays done after a reload"
FORM="dashboard-check-in-$HID" submit_form "$WEB_URL/" "$SESSION"
case $(api_get "/habits/habits/$HID") in *'"check_ins":[]'*) ok "web un-checks today from the dashboard" ;; *) fail "web: un-checking from the dashboard did not stick" ;; esac

FORM="check-in-$HID-$TODAY" submit_form "$WEB_URL/habits" "$SESSION"
case $(api_get "/habits/habits/$HID") in *"\"check_ins\":[\"$TODAY\"]"*) ok "web checks off today" ;; *) fail "web: checking off today did not stick" ;; esac
FORM="check-in-$HID-$TODAY" submit_form "$WEB_URL/habits" "$SESSION"
case $(api_get "/habits/habits/$HID") in *'"check_ins":[]'*) ok "web un-checks today" ;; *) fail "web: un-checking today did not stick" ;; esac

FORM="archive-habit-$HID" submit_form "$WEB_URL/habits/$HID/edit" "$SESSION"
case $(api_get "/habits/habits/$HID") in *'"archived":true'*) ok "web archives a habit" ;; *) fail "web: archiving did not stick" ;; esac
[ "$(curl -sS -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $SESSION" "$API_URL/habits/habits/$HID/check-ins/$TODAY")" = 409 ] \
  || fail "api: an archived habit's check-ins must be read-only"
ok "api keeps an archived habit read-only"

FORM="restore-habit-$HID" submit_form "$WEB_URL/habits/archived" "$SESSION"
case $(api_get "/habits/habits/$HID") in *'"archived":false'*) ok "web restores a habit" ;; *) fail "web: restoring did not stick" ;; esac
[ "$(curl -sS -o /dev/null -w '%{http_code}' -X DELETE -H "Authorization: Bearer $SESSION" "$API_URL/habits/habits/$HID")" = 409 ] \
  || fail "api: an active habit must be archived before it can be deleted"
ok "api refuses to delete an active habit"

FORM="archive-habit-$HID" submit_form "$WEB_URL/habits/$HID/edit" "$SESSION"
FORM="delete-habit-$HID" submit_form "$WEB_URL/habits/archived" "$SESSION"
grep -qi "^location: /habits/archived" "$WORK/headers" || fail "web: deleting a habit did not return to /habits/archived"
[ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SESSION" "$API_URL/habits/habits/$HID")" = 404 ] \
  || fail "web: deleting the archived habit did not remove it"
ok "web deletes an archived habit"

# Calendar, through the same forms: add an event today, see it on the Dashboard, edit
# it, and delete it through the confirmation page (the only form that can delete).
[ "$(curl -sS -o /dev/null -w '%{http_code}' "$API_URL/calendar/events?from=$TODAY&to=$TODAY")" = 401 ] \
  || fail "api: /calendar/events must refuse requests without a session"
ok "api refuses calendar requests without a session"

body=$(curl -fsS --max-time 10 -H "Cookie: $COOKIE=$SESSION" "$WEB_URL/calendar") || fail "web: /calendar failed"
case $body in *'data-testid="agenda"'*) ok "web calendar agenda" ;; *) fail "web: /calendar did not show the agenda" ;; esac

EVENT="Smoke test dentist $(date +%s)"
FORM=add-event-form submit_form "$WEB_URL/calendar" "$SESSION" \
  --form-string "title=$EVENT" --form-string "notes=" --form-string "startDay=$TODAY" \
  --form-string "startTime=09:00" --form-string "endDay=" --form-string "endTime=09:45"
EID=$(api_get "/calendar/events?from=$TODAY&to=$TODAY" | tr '{' '\n' | grep -F "\"title\":\"$EVENT\"" \
  | sed -n 's/^"id":"\([^"]*\)".*/\1/p')
[ -n "$EID" ] || fail "web: adding an event through the form did not create it"
case $(api_get "/calendar/events/$EID") in
  *'"start_time":"09:00"'*'"end_time":"09:45"'*) ok "web adds an event" ;;
  *) fail "web: the new event has the wrong time" ;;
esac

body=$(curl -fsS --max-time 10 -H "Cookie: $COOKIE=$SESSION" "$WEB_URL/") || fail "web: dashboard failed"
case $body in *'data-testid="dashboard-plans"'*"$EVENT"*) ok "web dashboard shows today's plans" ;; *) fail "web: the event is not in today's plans" ;; esac

FORM=edit-event-form submit_form "$WEB_URL/calendar/$EID/edit" "$SESSION" \
  --form-string "title=$EVENT (moved)" --form-string "notes=" --form-string "startDay=$TODAY" \
  --form-string "startTime=10:00" --form-string "endDay=" --form-string "endTime="
grep -qi "^location: /calendar" "$WORK/headers" || fail "web: saving an event did not return to /calendar"
case $(api_get "/calendar/events/$EID") in
  *"(moved)"*'"start_time":"10:00"'*) ok "web edits an event" ;;
  *) fail "web: editing the event did not stick" ;;
esac

body=$(curl -fsS --max-time 10 -H "Cookie: $COOKIE=$SESSION" "$WEB_URL/calendar/$EID/delete") || fail "web: delete page failed"
case $body in *"Delete this event?"*) ;; *) fail "web: the delete page did not ask for confirmation" ;; esac
FORM=delete-event-form submit_form "$WEB_URL/calendar/$EID/delete" "$SESSION"
grep -qi "^location: /calendar" "$WORK/headers" || fail "web: deleting an event did not return to /calendar"
[ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SESSION" "$API_URL/calendar/events/$EID")" = 404 ] \
  || fail "web: confirming the delete did not remove the event"
ok "web deletes an event after confirmation"

FORM=sign-out-form submit_form "$WEB_URL/" "$SESSION"
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
