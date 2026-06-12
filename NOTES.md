# NOTES — deliberate simplifications & deferred items

Running log, newest at top. Each entry: what was simplified/deferred, why, and what "done
properly" would look like.

## P1 — Engine

- **No burn cards.** Irrelevant without physical card-marking; documented so nobody "fixes" it.
- **Short big blind plays for the full BB price** (casino standard): if the BB posts all-in
  short, others still call the full BB; side pots reconcile the difference.
- **Open-fold edge cases found by the 10k sim** (both fixed, kept here as design notes):
  1. A betting round ends as soon as no meaningful action remains — a lone player with chips
     owing nothing never gets a turn (no live opponent could respond to a bet).
  2. On a fold-win, the last player with live cards takes *everything* on the table,
     including dead side-pot money above their own all-in level (pot eligibility only
     matters at showdown).
- **Runout pacing lives in the server.** The engine emits runout streets synchronously;
  the server inserts the ~1s dramatic beats between relays.
- **Dealing order** is one card at a time, twice around, starting left of the button —
  documented because rigged test decks depend on it.

## P0 — Scaffold

- **Local Postgres 9.5 unusable.** The machine runs PostgreSQL 9.5 (below Prisma's 9.6+
  minimum; credentials unknown). Dev & test use `embedded-postgres` (downloads real PG 17
  binaries into the workspace, project-local data dir). Production is Railway Postgres,
  unchanged. Revisit: nothing to fix — this is dev-only tooling.
- **No dead-button rule** (per brief §9): new players are dealt in from the next hand at no
  extra cost. Irrelevant at play-money; documented here as required.
- **Full hand action log** is optional in `HandRecord` and pruned after 7 days (per brief §6).
