# UOS Poker — build conventions

Production website for the University of Sheffield Poker Society: society home + in-person
leaderboards + a real-time play-money online poker room. The full spec lives in the original
brief; this file is the operating summary every session must follow.

## Non-negotiables (never compromise)

1. **Play-money only.** No real money, purchases, cash-out, or gambling links anywhere.
2. **Server-authoritative.** Clients send action *intents*; the server validates against the
   engine. Illegal actions are impossible, not hidden.
3. **Never transmit hidden information.** A socket payload contains only that client's own hole
   cards. Opponents' cards are *absent* from the payload until legitimately shown at showdown.
4. **Cryptographic shuffle.** Fisher–Yates seeded from `crypto.randomBytes`. Never `Math.random`
   for cards.
5. **Chip conservation.** Stacks + pots is invariant within a hand; asserted in the engine,
   tested in simulation.
6. **No invented society facts.** Real-world details come only from §22 of the brief; missing
   values render as designed "TBA", never fabrications.
7. **One deploy target.** Single Railway service + Postgres. Only external vendors: Resend,
   Google OAuth.

## Architecture map

```
pnpm-workspace (monorepo)
├── packages/engine    Pure TS No-Limit Hold'em engine. Zero I/O, zero framework imports,
│                      deterministic with injected RNG. Emits granular events. Exhaustively
│                      unit-tested (fixtures + 10k-hand simulation).
├── packages/shared    zod schemas, shared types, constants (stakes, timers, Elo params),
│                      socket event contracts, profanity blocklist. Client & server both
│                      import from here — they can never disagree about shapes.
├── apps/server        Node + Fastify + Socket.IO + Better Auth + Prisma/Postgres +
│                      Resend/React Email. Table manager, bot runtime, Elo service, REST API,
│                      admin API. Serves the built web app in production.
└── apps/web           React + Vite + TS + Tailwind v4 + Framer Motion. SPA, client routing.
```

- **Realtime:** one Socket.IO room per table; per-socket *personalised* state broadcasts.
  REST for everything non-realtime. zod validation on every API input and socket event.
- **Live table state lives in server memory** (single instance); only `HandRecord` summaries
  persist. A deploy mid-hand voids in-flight hands gracefully (stacks → bankrolls, users told).
- **Timezone:** all day/session/bonus logic uses **Europe/London**.
- **Timers are server-side**; state carries deadline timestamps, clients render countdowns.

## Game constants (packages/shared/src/constants.ts is the source of truth)

- NLHE, 2–6 players, blinds **50/100**. Action clock **20s** + one **30s time bank per orbit**.
- Disconnect: 10s grace; seat held 2 min; 5 min sat out → returned to lobby.
- Scaling: spawn a table when open human-available seats across public tables < 2; despawn
  after 5 min with zero humans (never the last table). Bots top up to ≥3 seated when a human
  is present, badged always, never chat, bottomless bankrolls.
- Elo: humans start 1000; K=24 first 30 rated hands (provisional), then K=8; floor 100;
  per-hand pairwise vs all dealt-in participants, ΔR_i += (K_i/(n−1))·(S_i−E_i); bots are
  immutable anchors (Fish 800 / Casual 1000 / Solid 1200 / Shark 1400). Practice tables and
  zero-human hands are unrated.
- Submissions: window 17:00–23:59 Europe/London on session day; 6-char code (no 0/O/1/I);
  one submission per user per session (DB unique). Default tournament points:
  10/7/5/3/2, everyone else 1.

## Design system — STEEL / EMBER

Underground card room lit by neon: machined steel, carbon felt, one neon-red light line.

```
--bg-0: #0A0B0D   --bg-1: #121417   --bg-2: #1A1D22
--steel: #2A2F36  --line: #343B44
--text: #D7DCE3   --muted: #8B93A1
--ember: #FF2D40  --ember-deep: #C8102E
--gold: #D8B05A   (reserved EXCLUSIVELY for #1 ranks & champions)
--felt: #14181C
```

- Metal = subtle vertical gradients + 1px top-edge highlights; never photo textures.
- **The ember glow is an attention budget.** At any moment exactly one thing glows — priority
  at the table: your turn → winning-hand reveal → big pot change → new street.
- Red is never body-text colour (contrast); display sizes only.
- Type: **Chakra Petch** (display: headlines, wordmark, HUD labels) + **Inter** (body) +
  tabular numerals everywhere numbers align (`font-variant-numeric: tabular-nums`).
- Signature motif: the **ember rail** — 1–2px neon line (nav underline, active seat ring,
  section dividers) that draws in on load and pulses on your turn.
- Copy: plain verbs, sentence case, active voice. Buttons say what they do. Errors say what
  happened and how to fix it. Empty states invite action.
- Floor: responsive to 360px, visible focus, semantic HTML, `prefers-reduced-motion` → fades,
  AA contrast.

## Workflow

- Phases P0–P8 (scaffold → engine → realtime+bots → auth+email → elo+boards+submissions →
  design+content → admin → hardening → deploy). **Never advance past a gate with failing
  tests.** One commit minimum per gate; commit at every meaningful step.
- `NOTES.md` records every deliberate simplification and deferred item — keep it current.
- TypeScript strict everywhere. ESLint + Prettier. Vitest for engine/server/shared,
  Playwright for E2E. CI (GitHub Actions) runs typecheck + tests on push.
- Engine work: fixtures first (min-raise reopen rule, side-pot layering, evaluator table),
  then implementation. The two fixtures in §9 of the brief are implemented verbatim.

## Commands

```
pnpm install            # workspace install
pnpm dev                # server (embedded dev Postgres) + web, concurrently
pnpm build              # build all packages/apps
pnpm typecheck          # tsc -b across the workspace
pnpm test               # vitest across workspace
pnpm lint               # eslint
pnpm db:migrate         # prisma migrate dev (apps/server)
pnpm db:studio          # prisma studio
```

## Local environment quirks (this machine)

- Windows 10, PowerShell 5.1. A PostgreSQL **9.5** service runs locally — too old for Prisma
  and credentials unknown. **Do not use it.** Dev/test DB comes from `embedded-postgres`
  (real PG binaries, project-local data dir) started by the dev/test scripts.
- pnpm installed globally via npm.
