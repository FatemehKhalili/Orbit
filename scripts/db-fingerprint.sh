#!/usr/bin/env sh
# Print a fingerprint of Orbit's data: every table, its row count, and a checksum of its
# rows. Two databases holding the same data print the same lines, so comparing the output
# before a backup and after a restore shows the data came back intact. Read-only.
#
#   ./scripts/db-fingerprint.sh > before.txt
#   ...
#   ./scripts/db-fingerprint.sh | diff before.txt -
#
# Uses compose.production.yml; set ORBIT_COMPOSE_FILE to use another Compose file.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd -P)
compose_file=${ORBIT_COMPOSE_FILE:-$root/compose.production.yml}

case ${1:-} in -h | --help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; esac

docker compose -f "$compose_file" exec -T db sh -c \
  'psql -X -v ON_ERROR_STOP=1 -q -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format(
  'SELECT %L || '' '' || count(*) || '' '' || coalesce(md5(string_agg(t::text, E''\n'' ORDER BY t::text)), ''-'') FROM %I.%I AS t',
  table_name, table_schema, table_name)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name
\gexec
COMMIT;
SQL
