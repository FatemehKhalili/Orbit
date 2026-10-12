#!/usr/bin/env sh
# CI helper for the backup, restore and upgrade jobs (ADR 0009). Not for real instances:
# `seed` writes test data.
#
#   orbit-data.sh seed      create the owner (ORBIT_CI_EMAIL, ORBIT_CI_PASSWORD) and data
#                           in every product table, including old check-ins and text
#                           with quotes, newlines and non-ASCII characters
#   orbit-data.sh seed-calendar
#                           add calendar events (Orbit 0.8.0 on): all-day and timed,
#                           points in time, events over midnight, and odd text
#   orbit-data.sh token     sign in through the API and print the session token
#   orbit-data.sh export T  print the export for session token T, minus its timestamp
#
# Uses ORBIT_COMPOSE_FILE like the scripts in scripts/, and API_URL (default
# http://localhost:8000).
set -eu

compose_file=${ORBIT_COMPOSE_FILE:-compose.production.yml}
API_URL=${API_URL:-http://localhost:8000}
compose() { docker compose -f "$compose_file" "$@"; }

case $1 in
  seed)
    printf '%s\n' "$ORBIT_CI_PASSWORD" \
      | compose exec -T api python -m app.cli create-owner \
          --email "$ORBIT_CI_EMAIL" --name "Zoë O'Brien" --password-stdin
    compose exec -T db sh -c 'psql -X -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
INSERT INTO shopping_items (id, owner_id, name, quantity, notes, checked)
SELECT gen_random_uuid(), id, 'Item ' || g || ' – crème brûlée', CASE WHEN g % 3 = 0 THEN NULL ELSE g || ' kg' END,
       CASE WHEN g % 2 = 0 THEN E'Line one\nLine "two" with \'quotes\' and \\backslash' END, g % 4 = 0
FROM users, generate_series(1, 40) AS g;
INSERT INTO habits (id, owner_id, name, notes, archived_at)
SELECT gen_random_uuid(), id, 'Habit ' || g || ' 🏃', 'Note ' || g, CASE WHEN g = 3 THEN now() END
FROM users, generate_series(1, 4) AS g;
INSERT INTO habit_check_ins (id, owner_id, habit_id, day)
SELECT gen_random_uuid(), h.owner_id, h.id, date '2024-02-01' + g * 3
FROM habits AS h, generate_series(0, 250) AS g;
SQL
    ;;
  seed-calendar)
    compose exec -T db sh -c 'psql -X -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
INSERT INTO calendar_events (id, owner_id, title, notes, all_day, start_day, end_day)
SELECT gen_random_uuid(), id, 'Trip ' || g || ' – Zürich 🏔', CASE WHEN g % 2 = 0 THEN E'Pack "light"\nand \'early\'' END,
       true, date '2024-02-01' + g * 5, date '2024-02-01' + g * 5 + g % 4
FROM users, generate_series(1, 30) AS g;
INSERT INTO calendar_events (id, owner_id, title, notes, all_day, starts_at, ends_at)
SELECT gen_random_uuid(), id, 'Call ' || g, CASE WHEN g % 3 = 0 THEN 'Note ' || g END, false,
       timestamptz '2024-03-30 22:30+00' + g * interval '7 hours',
       timestamptz '2024-03-30 22:30+00' + g * interval '7 hours' + (g % 5) * interval '45 minutes'
FROM users, generate_series(1, 60) AS g;
SQL
    ;;
  token)
    body=$(printf '{"email":"%s","password":"%s"}' "$ORBIT_CI_EMAIL" "$ORBIT_CI_PASSWORD")
    curl -fsS --max-time 15 -H 'Content-Type: application/json' -d "$body" "$API_URL/auth/login" \
      | jq -er .token
    ;;
  export)
    curl -fsS --max-time 30 -H "Authorization: Bearer $2" "$API_URL/account/export" \
      | jq -S 'del(.exported_at)'
    ;;
  *) echo "usage: $0 seed | seed-calendar | token | export TOKEN" >&2; exit 2 ;;
esac
