#!/usr/bin/env sh
# CI helper for the upgrade job: after upgrading a v0.7.0 database to the new code, check
# that every table v0.7.0 had is exactly as it was, that the only new table is
# calendar_events and that it is empty, and that the migration version is HEAD_REVISION.
#
#   upgrade-check.sh BEFORE.txt    BEFORE.txt: db-fingerprint.sh output taken on v0.7.0
#
# Uses ORBIT_COMPOSE_FILE like the scripts in scripts/.
set -eu

before=$1
: "${HEAD_REVISION:?set HEAD_REVISION to the newest migration}"
root=$(cd "$(dirname "$0")/../.." && pwd -P)
after=$(mktemp)
trap 'rm -f "$after"' EXIT
"$root/scripts/db-fingerprint.sh" > "$after"

# Tables that existed before: identical rows, and none missing. alembic_version is the
# one existing table the upgrade must change, so it is checked separately below.
grep -v '^alembic_version ' "$before" > "$after.old"
grep -v -e '^alembic_version ' -e '^calendar_events ' "$after" | diff "$after.old" - \
  || { echo "FAIL existing tables changed in the upgrade" >&2; rm -f "$after.old"; exit 1; }
rm -f "$after.old"
echo "ok   existing tables unchanged"

# The new table, and nothing else new: present, and empty.
grep -qx 'calendar_events 0 -' "$after" || { echo "FAIL calendar_events missing or not empty" >&2; exit 1; }
test "$(wc -l < "$after")" -eq "$(($(wc -l < "$before") + 1))" \
  || { echo "FAIL the upgrade added tables other than calendar_events" >&2; exit 1; }
echo "ok   calendar_events added, empty"

# The migration version.
compose_file=${ORBIT_COMPOSE_FILE:-$root/compose.production.yml}
version=$(docker compose -f "$compose_file" exec -T db sh -c \
  'psql -X -q -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT version_num FROM alembic_version"')
test "$version" = "$HEAD_REVISION" \
  || { echo "FAIL alembic_version is '$version', expected $HEAD_REVISION" >&2; exit 1; }
echo "ok   alembic_version is $HEAD_REVISION"
