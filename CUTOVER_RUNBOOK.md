# Cutover Runbook — Retire api.realtynewsnow.app

This document describes the steps to decommission the DigitalOcean Droplet
(`api.realtynewsnow.app` running `caxton-realtor-api`) now that all 46 Express
endpoints have been ported into this Next.js app under `/api/*`.

## Pre-flight (already done on `api-merge` branch)

- [x] All 46 Express endpoints ported to `/app/api/*` in this repo
- [x] Web callers flipped from `${API_URL}/*` to relative `/api/*`
  (via `lib/api-base.ts` returning `'/api'`)
- [x] DO Postgres callers (`magic-link`, `audit`, `giveaways`, `subscribers`,
      `realtors`, `webauthn`) switched from `db/do` → `db/neon`
- [x] `lib/server/db/do.ts` deleted
- [x] `app/api/ready` simplified to Neon-only probe
- [x] Scrapers already on Vercel Cron (`vercel.json` configured)

## Step 1 — Set Vercel environment variables

Required:

| Var | Value | Notes |
|-----|-------|-------|
| `DATABASE_URL` | Neon pooled connection string | Already set |
| `JWT_SECRET` | **Same as droplet's `JWT_SECRET`** | Critical for live-session continuity during cutover |
| `WEBAUTHN_RP_ID` | `realtynewsnow.app` | Required for passkey verification |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL | For rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token | For rate limiting |
| `RESEND_API_KEY` | Resend API key | For transactional email |

Remove **after** Step 4 verification:

- `DO_DATABASE_URL` (used to be set; no longer referenced in code)
- Anything pointing at `api.realtynewsnow.app`

## Step 2 — Data migration (DigitalOcean Postgres → Neon)

```bash
export DO_DATABASE_URL="postgres://..."     # from DO managed-pg console
export NEON_DATABASE_URL="postgres://..."   # from Neon project, with write access

./scripts/migrate-do-to-neon.sh
```

The script:

1. `pg_dump`s 14 tables from the droplet
2. `psql`-restores into Neon
3. Compares row counts side-by-side and prints a status table

**Verification:** every table should show `✓` (matching row counts). If any
shows `✗ MISMATCH`, abort cutover and investigate before continuing.

### Minimizing live-write drift during dump

The dump takes <60s for our data volume. To minimize drift:

1. Put the droplet API into read-only mode (e.g., return 503 from `/auth/*`
   and `/admin/*` POST routes via a quick patch) for the dump window, OR
2. Schedule cutover for a low-traffic window (late evening Central) and
   accept up to ~60s of writes that won't be replayed.

Anything written to DO after the dump but before the DNS flip will be lost.
We can replay critical rows after if needed (subscribers and magic_links are
the only tables with meaningful churn).

## Step 3 — Deploy `api-merge` branch to production

```bash
git checkout api-merge
git pull
# Open PR to main, review, merge
# Vercel will auto-deploy main on merge
```

Or trigger a production deploy from the Vercel dashboard pointing at `api-merge`.

## Step 4 — Verification

After Vercel deploys, hit the following on the production domain:

| URL | Expected |
|-----|----------|
| `https://realtynewsnow.app/api/health` | 200, `{ "status": "ok" }` |
| `https://realtynewsnow.app/api/ready` | 200, `{ "status": "ready", "neon": "connected" }` |
| `https://realtynewsnow.app/api/news/austin` | 200, array of articles |
| `https://realtynewsnow.app/api/ads/active?market=austin` | 200, array of ads |

Log into the admin UI and confirm:

- `/admin/events` loads + you can create/edit/delete an event
- `/admin/subscribers` paginates correctly
- `/admin/analytics/overview` shows subscriber counts (this was the most
  invasive caller refactor — uses `listSubscribers()` directly now)
- Passkey login works end-to-end

## Step 5 — DNS cutover

In your DNS provider:

1. Remove the `A` / `CNAME` record for `api.realtynewsnow.app`
2. Wait for TTL (5min default if you've kept it low)

Production should be unaffected — no code still calls `api.realtynewsnow.app`.

## Step 6 — Decommission DigitalOcean

After 24-48h of stable production on Vercel + Neon:

1. **Droplet:** destroy from DigitalOcean console (the one running `caxton-realtor-api`)
2. **Managed Postgres:** snapshot first (in case of forensics need), then destroy
3. **Floating IP / load balancer:** release if any
4. **Spaces / object storage:** check if anything outside the app uses it

## Step 7 — Remove unused Vercel env

After Step 6 is complete:

```
# Vercel project settings → environment variables
- DO_DATABASE_URL  (delete)
```

## Step 8 — Archive `caxton-realtor-api` repo

```bash
gh repo archive tawanna-hash/caxton-realtor-api --yes
```

This makes it read-only on GitHub but preserves history. **Do not delete** —
keep it for audit / rollback reference.

## Rollback plan

If anything breaks within the first 24h:

1. Re-point Vercel `DATABASE_URL` to a Neon read-replica (if drift is the issue)
2. Or, re-deploy the previous Vercel deployment (predates `api-merge`)
3. If both DBs are out of sync, restore Neon from the latest backup taken
   immediately before cutover

The droplet should be left **running but DNS-detached** for at least 24h post
cutover so we can flip DNS back in <5min if needed. Only destroy after the
verification window passes cleanly.
