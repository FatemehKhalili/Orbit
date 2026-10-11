# Releasing Orbit

Each phase ends in a release: an annotated Git tag `vX.Y.0-phaseN` and, from
`v0.6.0-phase6` on, a GitHub Release with notes. There are no published images; people
install by checking out the tag ([deployment guide](deployment/README.md)). Each step
below that changes `main`, a tag or a release happens only with the maintainer's
approval.

## 1. The phase's pull request

- Implements the phase's agreed scope, with its acceptance criteria each linked to the
  test or CI job that proves it in the PR description.
- Every CI job is green on the final commit, including "Production stack", "Backup and
  restore" and "Upgrade from …" against the previous release.
- If the phase adds a migration, its upgrade from the previous release is covered by the
  upgrade job, and its downgrade loses no user data or the release notes say so.
- Reviewed, then merged by the maintainer. SPEC still says "In progress".

## 2. Mark the phase complete

A small follow-up PR, as for earlier phases (for example `docs: mark Phase 5 complete
and bump versions to 0.5.0`):

- `docs/product/SPEC.md`: the phase's status becomes "Complete".
- `README.md`: the status line names the new tag.
- Versions: `apps/api/pyproject.toml` (then `uv lock` for `uv.lock`) and
  `apps/web/package.json` (then `npm install --package-lock-only` for
  `package-lock.json`) move to `X.Y.0`.
- If the upgrade job's previous-release tag should move, that waits until the new tag
  exists (step 4).

CI green, merged by the maintainer.

## 3. Check the release on a clean machine

On a machine (or fresh container) that is not CI, with no real data, follow the
[deployment guide](deployment/README.md) from the merge commit: install, create the
owner, sign in, add data, back up, delete the volume, restore, and check the data.

## 4. Tag

```bash
git checkout main && git pull
git tag -a vX.Y.0-phaseN -m "Orbit Phase N: <short title>"
git push origin vX.Y.0-phaseN
```

The tag points at the "mark complete" commit. Tags are never moved or deleted once
pushed. After tagging, the next phase's PR changes the upgrade job in
`.github/workflows/ci.yml` to start from this tag.

## 5. GitHub Release

Create a release from the tag (`gh release create vX.Y.0-phaseN --verify-tag`, or the
GitHub page) titled `Orbit vX.Y.0 (Phase N: <short title>)`, with no attached binaries
or images. Notes:

```markdown
## What's new
<what the owner can do now, in a few lines>

## Upgrade from vA.B.0-phaseM
1. Back up: `./scripts/backup.sh`, and keep that file.
2. `git fetch --tags && git checkout vX.Y.0-phaseN`
3. `docker compose -f compose.production.yml up -d --build`
<anything special: new settings, a migration that takes time, a changed default>

## Roll back
Restore the backup from step 1 and check out vA.B.0-phaseM, as in
docs/deployment/README.md#roll-back. Changes made after the backup are lost.
Never use `alembic downgrade` on real data.

## Known limitations
<what is not done, and anything that behaves unexpectedly>
```

Earlier tags (`v0.1.0-phase1` to `v0.5.0-phase5`) have no GitHub Release, and none is
added after the fact.
