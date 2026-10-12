# scripts

| Script          | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `setup-env.sh`  | Create `.env` from `.env.example` with a random DB password    |
| `smoke-test.sh` | Check a running stack: health, then sign in and out through the web login form |
| `check-image.sh` | Start a production image on its own and check its health endpoint (used by CI) |
| `backup.sh`     | Back up the database to a checked, private dump file ([guide](../docs/deployment/backup-and-recovery.md)) |
| `restore.sh`    | Restore a backup; refuses to replace data without `--force` and keeps what it replaced |
| `db-fingerprint.sh` | Row count and checksum of every table, to compare before a backup and after a restore |

`backup.sh`, `restore.sh` and `db-fingerprint.sh` use `compose.production.yml`; set
`ORBIT_COMPOSE_FILE` to use another Compose file.
