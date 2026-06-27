# Launch checklist — going live on Railway

Status of the launch-prep work and the remaining steps that need a human (only Kiran can
create the external accounts). Code is on branch `launch-prep-hardening`.

**Domain:** `uospoker.co.uk` (bought on Porkbun). **License:** MIT.

## Done (in code)

- [x] **Production env guard** — server refuses to boot in prod with a default/short
  `BETTER_AUTH_SECRET` or localhost `SITE_URL`/`BETTER_AUTH_URL` (`apps/server/src/env.ts`).
- [x] **Production guest demo mode** — opt-in "Play as guest" identity, sandboxed to practice
  tables + spectating; rated play blocked. Covered by `apps/server/test/guest.test.ts`.
- [x] **CSP** — dropped insecure `ws:` from prod `connect-src`.
- [x] **Favicon** (society `Logo.png`) + **robots.txt** + expanded OG/Twitter meta.
- [x] **Domain pre-wired** — `canonical` + `og:url` set to `https://uospoker.co.uk/`, and
  `og:image`/`twitter:image` made absolute (`apps/web/index.html`). Verified: web build green.
- [x] **LICENSE** — MIT (`LICENSE`, `"license": "MIT"` in root `package.json`).

## To do — needs your input/action

Do these roughly in order; later steps depend on Railway being up.

- [ ] **1. Resend: API key + sending domain.** In Resend, create an API key (you have the
  account). Add `uospoker.co.uk` as a sending domain — Resend will show DKIM (+ optional MX)
  records. Keep that tab open for step 3.
- [ ] **2. Railway: project + Postgres + env vars.** New project → add Postgres plugin →
  connect this GitHub repo (builds from `Dockerfile`). Set:
  - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
  - `NODE_ENV=production`
  - `SITE_URL=https://uospoker.co.uk`, `BETTER_AUTH_URL=https://uospoker.co.uk`
  - `BETTER_AUTH_SECRET=` → run `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`
  - `RESEND_API_KEY=` → from step 1
  - `EMAIL_FROM=UOS Poker <noreply@uospoker.co.uk>`
  - `ADMIN_EMAIL=kiranschahal@gmail.com`
  - (The env guard fails the boot loudly if the secret/URLs are wrong — that's expected.)
  - On first prod boot the logs print the **SPF + DMARC** records to add at Porkbun.
- [ ] **3. DNS at Porkbun.** In Porkbun → `uospoker.co.uk` → DNS, add:
  - The **DKIM** (and any MX) records from the Resend dashboard, then click **Verify domain**.
  - The **SPF + DMARC** records printed in the Railway boot logs.
  - The **custom-domain** record Railway gives you for the site itself (see step 4).
- [ ] **4. Point the domain at Railway.** Railway → service → Settings → Networking → Custom
  Domain → add `uospoker.co.uk` (and optionally `www`). Railway shows a CNAME/A target — add it
  at Porkbun alongside the email records. Wait for the cert to provision.
- [ ] **5. (Optional) Google sign-in.** Google Cloud Console → Credentials → OAuth client (Web).
  Redirect URI: `https://uospoker.co.uk/api/auth/callback/google`. Set `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` in Railway. Email/password works fully without this.
- [ ] **6. Smoke-test the live deploy.** Sign up with `ADMIN_EMAIL` → verify via Resend email →
  onboard nickname (auto-promoted to admin at `/admin`) → play a hand → submit a session
  result. Also test **Play as guest** (practice works, rated seats blocked). Check on a phone
  (≤360px).
- [ ] **7. (Optional) Ops hardening.** Enable Railway Postgres backups; consider error
  monitoring (e.g. Sentry); fill `SOCIETY.contactEmail` in `apps/web/src/content/society.ts`
  (currently `null` → renders "TBA"; e.g. a `@uospoker.co.uk` mailbox once you create one).

## Notes

- `SOCIETY.contactEmail` is still `null` (renders as "TBA") — left untouched because the real
  mailbox isn't decided yet. Tell me the address and I'll set it.
- Porkbun's free email forwarding can point `noreply@`/`contact@uospoker.co.uk` somewhere if you
  don't want a full mailbox — the sending side only needs the DKIM/SPF/DMARC records above.
</content>
