#!/usr/bin/env sh
# Restore an Orbit backup made by scripts/backup.sh (docs/deployment/backup-and-recovery.md).
#
#   ./scripts/restore.sh [--force] FILE
#
# Before anything changes, it checks FILE against its .sha256, reads the archive back, and
# makes sure the API and web app are stopped (stop them with
# `docker compose -f compose.production.yml stop web api`; the database keeps running).
#
# Into an empty database (a fresh install) it restores without asking. A database that
# already holds data is never replaced unless you pass --force and then type its name.
# Even then nothing is deleted: the restore goes into a new database first, and only when
# it has fully succeeded are the two swapped. The previous database stays on the server,
# renamed to <name>_before_restore_<date>_<time>, until you remove it yourself.
#
# Afterwards start Orbit again (`docker compose -f compose.production.yml up -d`). Its
# migration step brings a backup from an older version up to date.
#
# Uses compose.production.yml; set ORBIT_COMPOSE_FILE to use another Compose file.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd -P)
compose_file=${ORBIT_COMPOSE_FILE:-$root/compose.production.yml}

die() { echo "restore: $*" >&2; exit 1; }
usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
sha256() { if command -v sha256sum > /dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
compose() { docker compose -f "$compose_file" "$@"; }
# SQL as the database superuser, against the maintenance database or Orbit's own.
psql_admin() { compose exec -T db sh -c 'psql -X -v ON_ERROR_STOP=1 -q -tA -U "$POSTGRES_USER" -d postgres "$@"' psql "$@"; }
psql_orbit() { compose exec -T db sh -c 'psql -X -v ON_ERROR_STOP=1 -q -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }

force="" file=""
while [ $# -gt 0 ]; do
  case $1 in
    --force) force=1; shift ;;
    -h | --help) usage ;;
    -*) echo "restore: unknown option $1" >&2; usage 2 ;;
    *) [ -z "$file" ] || die "only one backup file, please"; file=$1; shift ;;
  esac
done
[ -n "$file" ] || usage 2
[ -f "$file" ] || die "no such file: $file"
# Keep the terminal for the confirmation below; docker would otherwise read it.
exec 3<&0 < /dev/null

# 1. The file is the one backup.sh wrote, intact.
dir=$(cd "$(dirname "$file")" && pwd -P)
name=$(basename "$file")
[ -f "$dir/$name.sha256" ] || die "no checksum file $dir/$name.sha256 next to the backup"
(cd "$dir" && sha256 -c "$name.sha256" > /dev/null 2>&1) \
  || die "$name does not match its checksum: the file is damaged or was changed. Nothing was restored."

# 2. The database is up, the app is not.
compose exec -T db true 2> /dev/null \
  || die "the database is not running. Start only it with: docker compose -f $compose_file up -d db"
running=$(compose ps --status running --services 2> /dev/null | grep -E '^(api|web)$' || true)
[ -z "$running" ] || die "stop the app first, so nothing writes during the restore:
  docker compose -f $compose_file stop web api"
compose exec -T db pg_restore -f /dev/null < "$file" \
  || die "$name is not a readable backup. Nothing was restored."

db=$(compose exec -T db sh -c 'printf %s "$POSTGRES_DB"')
user=$(compose exec -T db sh -c 'printf %s "$POSTGRES_USER"')
case $db in *[!a-zA-Z0-9_]* | "") die "unexpected database name '$db'" ;; esac
stamp=$(date -u +%Y%m%d_%H%M%S)  # lower case: SQL folds unquoted names
incoming="${db}_restore_${stamp}"
previous="${db}_before_restore_${stamp}"

# 3. What is there now: every table that holds at least one row.
contents=$(psql_orbit <<'SQL'
SELECT format('SELECT %L || '': '' || count(*) || '' rows'' FROM %I.%I HAVING count(*) > 0',
              table_name, table_schema, table_name)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'alembic_version'
ORDER BY table_name
\gexec
SQL
)
if [ -n "$contents" ]; then
  echo "The database '$db' is not empty:"
  echo "$contents" | sed 's/^/  /'
  [ -n "$force" ] || die "refusing to replace it. Restore into a fresh install, or pass --force to replace it (the current data is kept as a renamed database)."
  printf "Type the database name (%s) to replace it with %s: " "$db" "$name"
  read -r answer <&3 || answer=""
  [ -t 3 ] || echo
  [ "$answer" = "$db" ] || die "not confirmed; nothing was changed"
fi

# 4. Restore into a new database. Any failure leaves the current one untouched.
cleanup() { psql_admin -c "DROP DATABASE IF EXISTS \"$incoming\"" > /dev/null 2>&1 || true; }
trap cleanup EXIT
psql_admin -c "CREATE DATABASE \"$incoming\"" > /dev/null
compose exec -T db sh -c \
  'pg_restore --no-owner --no-privileges --exit-on-error --single-transaction -U "$POSTGRES_USER" -d "$1"' \
  restore "$incoming" < "$file" || die "pg_restore failed; the current database was not changed"

# 5. Swap: the restored database takes the name the app uses.
# One transaction: both renames happen, or neither does.
psql_admin -1 > /dev/null <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db' AND pid <> pg_backend_pid();
ALTER DATABASE "$db" RENAME TO "$previous";
ALTER DATABASE "$incoming" RENAME TO "$db";
SQL
trap - EXIT
if [ -z "$contents" ]; then
  psql_admin -c "DROP DATABASE \"$previous\"" > /dev/null  # it held no data
fi

echo "Restored $name into '$db'. It now holds:"
psql_orbit <<'SQL' | sed 's/^/  /'
SELECT format('SELECT %L || '': '' || count(*) || '' rows'' FROM %I.%I',
              table_name, table_schema, table_name)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'alembic_version'
ORDER BY table_name
\gexec
SQL
if [ -n "$contents" ]; then
  echo "The data it replaced is kept in the database '$previous'. Once Orbit works again,"
  echo "remove it with: docker compose -f $compose_file exec db dropdb -U $user $previous"
fi
echo "Next: docker compose -f $compose_file up -d   (migrations run before the API starts)"
