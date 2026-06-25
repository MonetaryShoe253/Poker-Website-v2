# UOS Poker

The website for **UOS Poker — the University of Sheffield Poker Society**: the society's
home, three public leaderboards, and a real-time **play-money** online poker room with a
correct No-Limit Hold'em engine, tiered AI bots, and a rated Elo ladder.

> **Play-money only.** There is no real-money gambling anywhere on this site.

---

## Stack

- **Monorepo** (pnpm workspaces)
  - `packages/engine` — pure, deterministic TypeScript poker engine (rules, evaluator, side
    pots, bots). Zero I/O.
  - `packages/shared` — zod schemas, constants, socket contracts, Elo math, profanity filter.
  - `apps/server` — Fastify + Socket.IO + Better Auth + Prisma/Postgres + Resend/React Email.
    Serves the built SPA in production.
  - `apps/web` — React + Vite + Tailwind v4 + Framer Motion SPA.
- One deploy target: a single **Railway** service + Postgres. External vendors: **Resend**
  (email) and **Google OAuth** (optional sign-in).

See `CLAUDE.md` for architecture conventions and `NOTES.md` for deliberate simplifications.

---

## Local development

**Prerequisites:** Node 22+, `pnpm` (`npm i -g pnpm`). No local Postgres needed — dev uses an
embedded Postgres 17 (downloaded on first run).

```bash
pnpm install

# 1. Start the dev database (real Postgres 17, project-local data dir, port 5433).
#    Leave this running in its own terminal.
pnpm --filter @uos-poker/server db:dev

# 2. In another terminal, create the local .env and apply migrations.
cp .env.example .env            # then fill in secrets (see below)
pnpm --filter @uos-poker/server db:migrate

# 3. Run server + web together.
pnpm dev
#   web  → http://localhost:5173
#   api  → http://localhost:3001
```

In development you can play immediately via the **dev door** on the lobby (pick a nickname;
no account needed). Email verification links are captured in an in-memory mailbox at
`GET /api/dev/mailbox?to=<email>` instead of being sent.

In **production** visitors can also "Play as guest" from the lobby — an ephemeral identity
(no account) sandboxed to **practice tables vs bots + spectating**. Rated play, a saved
bankroll, and the leaderboards still require a verified account. This keeps the live demo
one click away for portfolio/society visitors without exposing rated tables to throwaway
identities.

### Useful commands

```bash
pnpm typecheck         # tsc across the workspace
pnpm lint              # eslint
pnpm test              # vitest (engine + shared + server)
pnpm exec playwright test   # E2E (boots server+web automatically)
pnpm --filter @uos-poker/server db:studio   # Prisma Studio
```

---

## Environment variables

Copy `.env.example` to `.env` for local dev; set the same keys in Railway for production.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Local: the embedded PG URL in `.env.example`. Railway: the Postgres plugin's URL. |
| `BETTER_AUTH_SECRET` | yes | `node -e "console.log(crypto.randomBytes(32).toString('hex'))"` |
| `BETTER_AUTH_URL` | yes (prod) | The server's public URL, e.g. `https://uospoker.up.railway.app`. |
| `SITE_URL` | yes (prod) | Public site URL (same as above for the single-service deploy). |
| `PORT` | no | Defaults to 3001; Railway injects its own. |
| `RESEND_API_KEY` | prod | Without it, email is captured to the dev mailbox (dev) or logged (prod). |
| `EMAIL_FROM` | prod | e.g. `UOS Poker <noreply@yourdomain>`; the domain drives the DNS print. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Enables "Continue with Google". |
| `ADMIN_EMAIL` | recommended | The account that signs up with this email is auto-promoted to admin. |

---

## Human setup checklist (Kiran)

1. **Domain** — buy one, then set `SITE_URL`, `BETTER_AUTH_URL`, and the `EMAIL_FROM` domain.
2. **Railway** — create a project, add the **Postgres** plugin, connect this GitHub repo.
   Railway builds from the `Dockerfile`; `start:prod` runs `prisma migrate deploy` then boots.
   Set all env vars above in the service. In production the server **refuses to start** unless
   `BETTER_AUTH_SECRET` is a real 32+ char secret and `SITE_URL`/`BETTER_AUTH_URL` are public
   https URLs — it prints exactly what's missing and exits, so a misconfigured deploy fails
   loudly instead of booting insecurely.
3. **Resend** — create an account + API key (`RESEND_API_KEY`). Add your sending domain in the
   Resend dashboard, then add the DNS records **the server prints on first production boot**
   (SPF + DMARC are printed in full; copy the DKIM value from the Resend dashboard). Verify the
   domain in Resend.
4. **Google OAuth** (optional) — Google Cloud Console → Credentials → OAuth client (Web).
   Authorised redirect URI: `${BETTER_AUTH_URL}/api/auth/callback/google`. Set the client
   id/secret env vars.
5. **Society facts** — real-world details live in `apps/web/src/content/society.ts`. Unfilled
   items render as tasteful "TBA".

### First admin

Sign up with the email you set as `ADMIN_EMAIL`, verify it, and that account becomes an admin
automatically. The cockpit is at `/admin` (session codes, submissions, scheme, seasons, users,
banner, dashboard).

---

## Deployment (Railway)

The repo is deploy-ready:

- **Build:** `Dockerfile` (Node 22, installs deps, generates the Prisma client, builds the SPA).
- **Release/start:** `start:prod` → `prisma migrate deploy && node --import tsx src/index.ts`.
- **Health check:** `GET /healthz` (configured in `railway.json`).
- **Static SPA:** the server serves `apps/web/dist` in production and falls back to
  `index.html` for client routes; `/api/*` and `/socket.io` stay server-routed.

Add the Postgres plugin, set env vars, deploy. Then smoke-test the full loop:
**sign up → verify (Resend email) → onboard nickname → play a hand → submit a session result.**

> **Note on live game state:** tables and in-flight hands live in server memory (single
> instance). A deploy mid-hand voids in-flight hands gracefully — stacks return to bankrolls
> and players see a notice. Only `HandRecord` summaries and Elo are persisted.
