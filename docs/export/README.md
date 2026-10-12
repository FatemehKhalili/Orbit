# Orbit data export

**Download my data** in the web app (or `GET /account/export` on the API with a session)
gives the signed-in owner everything they have in Orbit as one JSON file,
`orbit-export-YYYY-MM-DD.json`. It is yours to keep, read or move to another tool. It is
not a backup: it leaves out secrets and cannot restore Orbit (see
[Backups and recovery](../deployment/backup-and-recovery.md)). Decision:
[ADR 0009](../decisions/0009-production-deployment-backups-and-upgrades.md).

## Format

The file follows [orbit-export-1.schema.json](orbit-export-1.schema.json) (JSON Schema
2020-12). The schema is generated from the API's code and a test fails if the two
differ; regenerate it with:

```bash
(cd apps/api && uv run --frozen python -m app.api.account) > docs/export/orbit-export-1.schema.json
```

```json
{
  "format": "orbit-export",
  "format_version": "1.0",
  "exported_at": "2026-10-11T17:00:00.123456Z",
  "orbit_version": "0.7.0",
  "timezone": "Europe/Berlin",
  "account": { "email": "you@example.com", "display_name": "You", "created_at": "..." },
  "shopping": {
    "items": [
      { "id": "…", "name": "Milk", "quantity": "2 l", "notes": null, "checked": false,
        "created_at": "…", "updated_at": "…" }
    ]
  },
  "habits": {
    "habits": [
      { "id": "…", "name": "Read", "notes": null, "archived_at": null,
        "created_at": "…", "updated_at": "…",
        "check_ins": [ { "day": "2026-10-10", "created_at": "…" } ] }
    ]
  }
}
```

- **Everything you own:** every shopping item, every habit (active and archived) and
  every check-in of its whole history, not only the seven days the pages show. Items and
  habits are in the order you added them; check-ins oldest first.
- **Times** (`*_at`) are UTC timestamps (ISO 8601). **Days** (`day`) are calendar dates
  in the instance timezone, given as `timezone` ([ADR 0008](../decisions/0008-dates-and-the-instance-timezone.md)).
- **IDs** are stable: the same item has the same `id` in every export.
- Every object is closed (`additionalProperties: false`); a field is never left out, it
  is `null` instead.

## What is not in the export, and why

| Data                                | Why it is left out                                             |
| ----------------------------------- | -------------------------------------------------------------- |
| Password and password hash          | An authentication secret; never leaves the server except in a backup |
| Sessions (`sessions`)               | Authentication secrets (hashes of sign-in tokens)              |
| Remembered browsers (`login_devices`) | Authentication secrets (hashes of device tokens)             |
| Sign-in throttle (`login_throttles`) | Security state about sign-in attempts, not your data          |
| Internal owner IDs                  | Meaningless outside this instance                              |
| Other users' data                   | Every query is limited to the signed-in owner                  |

The API keeps a list of every table as exported or excluded with its reason
(`EXPORTED_TABLES` and `EXCLUDED_TABLES` in `apps/api/app/api/account.py`). A test fails
when a new table is in neither, so each new module decides what its export holds.

## Versions

`format_version` is `MAJOR.MINOR`. A new module or a new field raises the minor version
(`1.1`): readers of `1.0` that ignore unknown sections keep working. Renaming or removing
a field, or changing its meaning, raises the major version and publishes a new schema
file (`orbit-export-2.schema.json`).

## Handling the file

The export holds your personal data in readable form. The download is never cached
(`Cache-Control: no-store`); after that it is a file like any other on your device, so
keep it where you keep other private documents.

Orbit cannot import an export yet.
