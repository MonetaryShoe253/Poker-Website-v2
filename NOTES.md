# NOTES — deliberate simplifications & deferred items

Running log, newest at top. Each entry: what was simplified/deferred, why, and what "done
properly" would look like.

## P0 — Scaffold

- **Local Postgres 9.5 unusable.** The machine runs PostgreSQL 9.5 (below Prisma's 9.6+
  minimum; credentials unknown). Dev & test use `embedded-postgres` (downloads real PG 17
  binaries into the workspace, project-local data dir). Production is Railway Postgres,
  unchanged. Revisit: nothing to fix — this is dev-only tooling.
- **No dead-button rule** (per brief §9): new players are dealt in from the next hand at no
  extra cost. Irrelevant at play-money; documented here as required.
- **Full hand action log** is optional in `HandRecord` and pruned after 7 days (per brief §6).
