# NOTES — deliberate simplifications & deferred items

Running log, newest at top. Each entry: what was simplified/deferred, why, and what "done
properly" would look like.

## P3 — Auth + emails

- **Lazy profile creation**: Profile (and nickname) is created at onboarding after
  verification, not at signup — one uniform flow for email and Google users. Until then
  users can spectate but not sit.
- **Bankrolls are write-behind**: in-memory cache is authoritative while seated; every
  change queues a serialised Profile update. A hard crash could lose the last seconds of
  bankroll deltas (acceptable at play-money; revisit if it ever matters).
- **Welcome email idempotency** via `User.welcomedAt` (Better Auth's hook name shifted
  across versions — empirically `afterEmailVerification` in 1.6.x; the column guard makes
  the behaviour version-proof).
- **Dev door**: localStorage-nickname identity survives in dev builds only
  (`import.meta.env.DEV` in web, `!isProd` + session-miss on the server). Production
  sockets accept session cookies only.
- **better-call peer warning** (wants zod 4) is benign: zod 3.25 ships the v4 core under
  `zod/v4`, which is what better-auth's dependency actually imports.
- Playwright E2E runs locally against the embedded PG; CI runs unit/integration tests only
  (browser E2E in CI deferred — revisit in P7/P8).
- Resend DNS records (SPF/DKIM) are documented in the README at P8 — they depend on the
  yet-unchosen domain (§22 DOMAIN is TBD).

## P2 — Realtime tables + bots

- **Dev identity** (`realtime/users.ts`): nickname-keyed ephemeral users + in-memory
  bankrolls. P3 replaces `resolveUser` with Better Auth sessions and moves bankrolls to the
  Profile table; the realtime layer's shape is already final.
- **HandRecord persistence deferred to P4** (needs auth + DB identity). `Table.onHandSettled`
  already produces the full settlement payload, so P4 only wires a listener.
- **Bot tier params are calibrated raw inputs** — measured table stats (what the spec
  targets) sit below raw thresholds because BB free checks and raised pots dilute them.
  `scripts/calibrate-bots.ts` re-measures; recalibrate after any policy change.
- **Soak test runs accelerated** (5 tables × 60+ hands at ~200ms clocks) rather than 30
  wall-clock minutes; same hand volume, asserts zero errors + flat heap + per-hand chip
  conservation. The 30-min figure is matched in hands played, not in minutes.
- **Time bank refresh rule**: a player's once-per-orbit time bank resets when the button
  lands on their seat (clean per-orbit approximation).
- **Aggression validation**: spec gives no numeric AF targets, so the suite asserts ordering
  (Shark/Solid > Casual > Fish) alongside the numeric VPIP/PFR ±5pt assertions.
- **UOS_FAST_TABLES=1** env shortens all table clocks for dev/E2E (never in production).
- Chat history is not persisted; spectator chat visibility per spec; emote-only mode flag
  deferred to P5.

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
