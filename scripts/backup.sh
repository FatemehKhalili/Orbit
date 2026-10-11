#!/usr/bin/env sh
# Back up Orbit's database to a file (ADR 0009, docs/deployment/backup-and-recovery.md).
#
#   ./scripts/backup.sh [--keep N] [DIR]
#
# Writes DIR/orbit-<UTC time>.dump (a pg_dump custom-format archive: one consistent
# snapshot, taken while Orbit keeps running) and a .sha256 checksum next to it. DIR
# defaults to $ORBIT_BACKUP_DIR, then ~/orbit-backups. With --keep N, only the newest N
# backups in DIR are kept; nothing else in DIR is ever touched.
#
# A backup holds everything, including the password hash and every session: files are
# created readable by you alone, never inside this repository. Encrypt copies you keep
# elsewhere (see the guide).
#
# Runs against the production stack (compose.production.yml); set ORBIT_COMPOSE_FILE to
# use another Compose file, such as docker-compose.yml for a development install.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd -P)
compose_file=${ORBIT_COMPOSE_FILE:-$root/compose.production.yml}

die() { echo "backup: $*" >&2; exit 1; }
usage() { sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
sha256() { if command -v sha256sum > /dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
compose() { docker compose -f "$compose_file" "$@"; }

keep="" dir=""
while [ $# -gt 0 ]; do
  case $1 in
    --keep) [ $# -ge 2 ] || die "--keep needs a number"; keep=$2; shift 2 ;;
    --keep=*) keep=${1#*=}; shift ;;
    -h | --help) usage ;;
    -*) echo "backup: unknown option $1" >&2; usage 2 ;;
    *) [ -z "$dir" ] || die "only one directory, please"; dir=$1; shift ;;
  esac
done
case $keep in
  "") ;;
  *[!0-9]* | 0*) die "--keep must be a whole number of at least 1" ;;
esac
dir=${dir:-${ORBIT_BACKUP_DIR:-$HOME/orbit-backups}}

umask 077
created=""
[ -d "$dir" ] || created=1
mkdir -p "$dir"
dir=$(cd "$dir" && pwd -P)
case "$dir/" in
  "$root"/*) [ -z "$created" ] || rmdir "$dir"; die "refusing to write into the repository ($root): backups hold all personal data and the password hash. Choose a directory outside it." ;;
esac

compose exec -T db true 2> /dev/null \
  || die "the database is not running. Start it with: docker compose -f $compose_file up -d db"

name="orbit-$(date -u +%Y%m%dT%H%M%SZ).dump"
file="$dir/$name"
[ ! -e "$file" ] || die "$file already exists; try again in a second"
partial="$file.partial"
trap 'rm -f "$partial"' EXIT

# --no-owner/--no-privileges: the file restores into any Orbit database, whatever its
# role names. The dump runs inside the database container, so its pg_dump always matches
# the server's version.
compose exec -T db sh -c \
  'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$partial" || die "pg_dump failed; no backup was written"
[ -s "$partial" ] || die "pg_dump wrote nothing; no backup was written"
# Read the archive back before calling it a backup.
compose exec -T db pg_restore --list < "$partial" > /dev/null \
  || die "the dump cannot be read back; no backup was written"

mv "$partial" "$file"
trap - EXIT
(cd "$dir" && sha256 "$name" > "$name.sha256")
chmod 600 "$file" "$file.sha256"
echo "Backup written: $file ($(wc -c < "$file" | tr -d ' ') bytes)"
echo "Checksum:       $file.sha256"

if [ -n "$keep" ]; then
  # Names sort by time. Only files this script writes are candidates for removal.
  old=$(cd "$dir" && ls -1 | grep -E '^orbit-[0-9]{8}T[0-9]{6}Z\.dump$' | sort -r | tail -n +"$((keep + 1))")
  for stale in $old; do
    rm -f "$dir/$stale" "$dir/$stale.sha256"
    echo "Removed old backup: $dir/$stale"
  done
fi
