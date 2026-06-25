# Launch checklist — going live on Railway

Status of the launch-prep work and the remaining steps that need a human (only Kiran can
create the external accounts). Code is on branch `launch-prep-hardening`.

## Done (in code, verified: typecheck + lint + 92 tests + build all green)

- [x] **Production env guard** — server refuses to boot in prod with a default/short
  `BETTER_AUTH_SECRET` or localhost `SITE_URL`/`BETTER_AUTH_URL` (`apps/server/src/env.ts`).
- [x] **Production guest demo mode** — opt-in "Play as guest" identity, sandboxed to practice
  tables + spectating; rated play blocked. Covered by `apps/server/test/guest.test.ts`.
- [x] **CSP** — dropped insecure `ws:` from prod `connect-src`.
- [x] **Favicon** (`apps/web/public/favicon.svg`) + **robots.txt** + expanded OG/Twitter meta.

## To do — needs your input/action

Do these roughly in order; later steps depend on the domain.

- [ ] **1. Choose & buy a domain.** Everything below references it. _Tell Claude the domain and
  it can pre-wire `og:url`/canonical and any config that depends on it._
- [ ] **2. Railway: project + Postgres + env vars.** New project → add Postgres plugin →
  connect this GitHub repo (builds from `Dockerfile`). Set:
  - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
  - `NODE_ENV=production`
  - `SITE_URL=https://YOUR_DOMAIN`, `BETTER_AUTH_URL=https://YOUR_DOMAIN`
  - `BETTER_AUTH_SECRET=` → `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`
  - `RESEND_API_KEY`, `EMAIL_FROM=UOS Poker <noreply@YOUR_DOMAIN>`
  - `ADMIN_EMAIL=kiranschahal@gmail.com`
  - (The new env guard will fail the boot loudly if the secret/URLs are wrong — that's expected.)
- [ ] **3. Resend + email DNS.** Create account + `RESEND_API_KEY`, add sending domain. Add the
  DNS records at your registrar: SPF + DMARC (printed in full on first prod boot) and the DKIM
  value from the Resend dashboard. Click **Verify domain**.
- [ ] **4. Point domain DNS at Railway.** Service → Settings → Networking → Custom Domain; add
  the CNAME/A record Railway gives you (alongside the Resend records).
- [ ] **5. (Optional) Google sign-in.** Google Cloud Console → Credentials → OAuth client (Web).
  Redirect URI: `https://YOUR_DOMAIN/api/auth/callback/google`. Set `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET`. Email/password works fully without this.
- [ ] **6. Decide on a LICENSE.** MIT/Apache-2.0 (open, good freelance showcase) vs proprietary
  "All rights reserved". _Tell Claude which and it adds the file._
- [ ] **7. Smoke-test the live deploy.** Sign up with `ADMIN_EMAIL` → verify via Resend email →
  onboard nickname (auto-promoted to admin at `/admin`) → play a hand → submit a session
  result. Also test **Play as guest** (practice works, rated seats blocked). Check on a phone
  (≤360px).
- [ ] **8. (Optional) Ops hardening.** Enable Railway Postgres backups; consider error
  monitoring (e.g. Sentry); fill `SOCIETY.contactEmail` in `apps/web/src/content/society.ts`;
  add `og:url`/canonical once the domain is final.

## Two items Claude can finish immediately once you decide

- LICENSE file (pick one).
- `og:url` + canonical meta (need the final domain).
