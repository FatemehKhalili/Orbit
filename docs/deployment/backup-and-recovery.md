# Backups and recovery

A backup is the only way back after a lost disk, a broken machine or a bad upgrade.
Orbit makes them with `scripts/backup.sh` and restores them with `scripts/restore.sh`.
Both run on the server, in the Orbit checkout, against the production setup
([deployment guide](README.md)). Reasons and limits:
[ADR 0009](../decisions/0009-production-deployment-backups-and-upgrades.md).

A backup is not the same as **Download my data** in the web app. That export is your
own data as a readable JSON file to keep or take elsewhere; it leaves out secrets and
cannot restore Orbit ([export format](../export/README.md)).

## What a backup contains, and why it is sensitive

A backup is a complete copy of the database: every shopping item, habit and check-in,
your email and name, **your password hash**, every session and remembered browser, and
the sign-in throttle state. Anyone with the file can read all your data and try to crack
your password offline. Treat it like the server itself:

- The script writes it readable by you alone (mode 600) and refuses to write it inside
  the Orbit checkout, where it could end up in Git.
- Keep backups on the server unencrypted only if the server's disk is as safe as you need.
- **Encrypt every copy that leaves the machine** (below). A cloud drive, a USB stick or
  another computer is a copy that leaves the machine.

## Make a backup

```bash
./scripts/backup.sh                    # into ~/orbit-backups (or $ORBIT_BACKUP_DIR)
./scripts/backup.sh /mnt/backup/orbit  # or a directory of your choice
```

It works while Orbit runs and takes one consistent snapshot. It writes
`orbit-<UTC time>.dump` and `orbit-<UTC time>.dump.sha256`, and reads the whole dump back
before reporting success. A dump from the development setup:
`ORBIT_COMPOSE_FILE=docker-compose.yml ./scripts/backup.sh`.

### Schedule it

Orbit has no background jobs; use the host's scheduler. With cron (`crontab -e`), daily
at 03:15, keeping the newest 14:

```cron
15 3 * * *  cd /srv/orbit && ./scripts/backup.sh --keep 14 2>&1 | logger -t orbit-backup
```

The output goes to the system log (`journalctl -t orbit-backup`, or `/var/log/syslog`).

A systemd timer works the same way. Check the log now and then: a backup that silently
stopped is the most common way to lose data.

### Retention

Without `--keep`, nothing is ever deleted. With `--keep N`, the newest N backups the script
made in that directory are kept and older ones (and their checksum files) are removed;
any other file there is left alone. 14 daily backups is a sensible start. Keep the
backup from before each upgrade separately until you are sure about the new version.

## Encrypt copies and take them off the machine

A backup on the same disk does not survive that disk. Keep at least one recent copy
elsewhere, encrypted. The scripts do not encrypt, so you choose the tool and keep the key.
Two options:

**[age](https://age-encryption.org)** with a key pair. Keep the private key somewhere
other than the backups, for example in your password manager, and printed:

```bash
age-keygen -o orbit-backup.key               # once; prints the public key (age1...)
age -r age1yourpublickey... -o orbit-20261011T031500Z.dump.age orbit-20261011T031500Z.dump
# restoring needs the private key:
age -d -i orbit-backup.key -o orbit-20261011T031500Z.dump orbit-20261011T031500Z.dump.age
```

**gpg** with a passphrase (store the passphrase in your password manager):

```bash
gpg --symmetric --cipher-algo AES256 orbit-20261011T031500Z.dump    # writes .dump.gpg
gpg --output orbit-20261011T031500Z.dump --decrypt orbit-20261011T031500Z.dump.gpg
```

Copy the encrypted file **and** its `.sha256` (the checksum is not secret) with whatever
you trust: `rsync`, `rclone` to a cloud drive, an external disk. After decrypting, keep
the `.dump` and `.sha256` side by side: restore checks one against the other.

Without the key or passphrase an encrypted backup cannot be restored by anyone,
including you. Test a restore from an off-site copy once, on another machine.

## Restore

```bash
docker compose -f compose.production.yml stop web api     # the database keeps running
./scripts/restore.sh ~/orbit-backups/orbit-<time>.dump
docker compose -f compose.production.yml up -d             # migrations run first
```

The script, in order:

1. Checks the file against its `.sha256` and reads the archive. A damaged or incomplete
   file stops it before anything changes.
2. Refuses while the API or the web app runs.
3. Into an empty database (a fresh install), restores without asking. If the database
   holds data, it lists it and refuses, unless you pass `--force` and then type the
   database name (`orbit`).
4. Restores into a new database in one transaction. If anything fails, that new database
   is dropped and yours is untouched.
5. Swaps the restored database in. Data it replaced is **kept**, renamed to
   `orbit_before_restore_<date>_<time>`.
6. Prints what the database now holds.

A backup from an older Orbit version is fine: the next `up` runs the migrations. A backup
from a **newer** version cannot go into an older one.

### After a restore

Sign in and check your data. `./scripts/db-fingerprint.sh` prints a row count and
checksum per table: run it before a backup and after the restore, and identical output
means identical data. Once you are sure, remove the replaced database:

```bash
docker compose -f compose.production.yml exec db dropdb -U orbit orbit_before_restore_<date>_<time>
```

(`docker compose -f compose.production.yml exec db psql -U orbit -l` lists the databases.)
Until then it takes disk space, and it lets you undo a mistaken restore by renaming it
back.

## Recovery runbook

**The data volume is gone** (deleted volume, `down -v`, a new disk):

1. `docker compose -f compose.production.yml up -d --build db` (a new, empty database).
2. `./scripts/restore.sh <latest backup>` (no `--force` needed: it is empty).
3. `docker compose -f compose.production.yml up -d --build` and sign in.

**Moving to a new machine:**

1. Install Orbit on the new machine at the **same or a newer** release
   ([deployment guide](README.md#install)). Do not create an owner; the backup brings it.
2. Copy the latest backup and its `.sha256` over (encrypted if it crosses a network you
   do not control).
3. Start only the database and restore, as above. Your password and data come with it.
4. Point your HTTPS name at the new machine. With `ORBIT_TLS=internal`, the new Caddy has
   a new root certificate: install it on your devices, or copy the old `caddy-data` volume.

**An upgrade went wrong:** follow [Roll back](README.md#roll-back) with the backup you
made before upgrading.

**A restore went wrong** (wrong file, wrong time): stop the app, then swap the kept
database back:

```bash
docker compose -f compose.production.yml exec db psql -1 -v ON_ERROR_STOP=1 -U orbit -d postgres \
  -c 'ALTER DATABASE orbit RENAME TO orbit_mistake' \
  -c 'ALTER DATABASE orbit_before_restore_<date>_<time> RENAME TO orbit'
```

Both renames happen together or not at all, so a typo changes nothing.

**Locked out of sign-in:** see [the deployment guide](README.md#signing-in-and-when-it-is-blocked);
no restore needed.

## Limitations

- A backup is a point in time. Restoring loses everything written after it.
- A backup restores into the same or a newer Orbit version only.
- Backups are only as safe as where you keep them; encryption and off-site copies are up
  to you.
- The scripts back up the database. `.env` (the database password) and the Caddy volume
  are not in it; a restore into a new install does not need them, but keep a copy of
  your settings.
- CI proves backup, restore, upgrade and rollback on test data on every change. It cannot
  prove that your own backups are complete: restore one now and then.
