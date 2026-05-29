# Environment Variable Setup Guide — caxton-realtor-app-web

_Generated 2026-05-28. Companion to `ENV_AUDIT.md`. This guide walks every
environment variable that is **referenced in code but currently unset in the
Vercel project** and tells you, per variable, whether to set it, ignore it,
or treat it as a known silent-failure path._

## TL;DR

Twenty-one variables are referenced in the code but unset in the Vercel
project. **None of them are silently breaking a feature on
`realtynewsnow.app` right now.** Each one falls into one of three buckets:

| Bucket | Count | Action |
|---|---:|---|
| **Has a safe in-code default** | 12 | Leave unset unless you want to override |
| **Auto-injected by Vercel runtime** | 2 | Never set manually |
| **Alternate-name alias for a var that IS set** | 7 | Leave unset (the primary alias is already in Vercel) |

The earlier silent-failure path — `EMAIL_PROVIDER` defaulting to `console` —
was fixed in commit `26102d8`'s follow-up: `EMAIL_PROVIDER=resend`,
`EMAIL_FROM_ADDRESS`, and `EMAIL_FROM_NAME` are now set in production and
preview, and live Resend sends are verified in `email_log`.

---

## 1. Vars with safe in-code defaults (set only to override)

Each of these has a hard-coded fallback. Production runs fine with them
unset. Set one only when you want to deviate from the default.

### `JWT_EXPIRY`
- **Default**: `'7d'`
- **Source**: `lib/server/jwt.ts:37` — `return (process.env.JWT_EXPIRY as SignOptions['expiresIn']) ?? '7d';`
- **What sets it**: Lifetime of signed JWT session cookies.
- **When to set**: Only if you want sessions shorter (e.g. `'24h'`) or longer than 7 days. Format: ms-style string per the `jsonwebtoken` package.
- **Verdict**: ✅ Safe to leave unset.

### `LOG_LEVEL`
- **Default**: not `'debug'` → debug logs suppressed
- **Source**: `lib/server/logger.ts:34` — only `debug` is gated; `info`/`warn`/`error` always emit.
- **When to set**: Set to `'debug'` temporarily on Preview to surface verbose logs during diagnosis. Never on Production.
- **Verdict**: ✅ Safe to leave unset.

### `EMAIL_REPLY_TO`
- **Default**: Resend send omits the `reply_to` field, so replies go back to the From address (`tawanna@myrealtyline.com`).
- **Source**: `lib/server/email/resend-provider.ts:40` — `input.replyTo ?? process.env.EMAIL_REPLY_TO` then `if (replyTo) payload.reply_to = replyTo`.
- **When to set**: If you want replies to go somewhere other than the From address (e.g. `support@myrealtyline.com`).
- **Verdict**: ✅ Safe to leave unset.

### `INVENTORY_NOTIFY_TO`
- **Default**: `'tawanna@myrealtyline.com'`
- **Source**: `app/api/inventory/submit/route.ts:27`.
- **What it does**: Email recipient for new inventory submissions.
- **When to set**: If notifications should go to a shared inbox (e.g. `submissions@…`).
- **Verdict**: ✅ Safe to leave unset.

### `MAGIC_LINK_EXPIRY_MINUTES`
- **Default**: `15`
- **Sources**: `lib/server/magic-link.ts:21`, `app/api/auth/signup/route.ts:27`.
- **When to set**: To make magic links shorter-lived (e.g. `'5'`) or longer.
- **Verdict**: ✅ Safe to leave unset.

### `MAGIC_LINK_FROM_NAME`
- **Default**: `theme.fromEmailDisplayName` from `lib/pub-meta.ts` (currently `"Realty Line"` or per-publication).
- **Sources**: `app/api/admin/advertisers/[id]/send-report/route.ts:229`, `batch-report/route.ts:229`, `r/advertiser/[slug]/request-access/route.ts:142`.
- **Scope**: Only the advertiser-report and request-access routes use this. Auth magic links and password resets read `EMAIL_FROM_NAME` instead, which is already set to `"Tawanna Verock, publisher"`.
- **When to set**: If you want a consistent display name across both flows. Recommended for consistency.
- **Verdict**: ✅ Safe to leave unset.

### `APP_URL` / `NEXT_PUBLIC_APP_URL`
- **Default**: Falls back to the request's `x-forwarded-proto` + `host`, finally `https://app.myrealtyline.com`.
- **Source**: `app/api/admin/advertisers/{[id]/send-report,batch-report}/route.ts:44/46`, `app/api/r/advertiser/[slug]/request-access/route.ts:32` (via `getOrigin(req)`).
- **When to set**: If `Host` header is unreliable (e.g. behind a CDN that strips it) — set `NEXT_PUBLIC_APP_URL=https://realtynewsnow.app`.
- **Verdict**: ✅ Safe to leave unset on Vercel (Vercel sets the `host` header correctly).

### `NEXT_PUBLIC_SITE_URL`
- **Default**: Falls back to the request's `x-forwarded-proto` + `host`.
- **Sources**: `app/api/admin/auth/forgot-password/route.ts:64`, `app/api/auth/forgot-password/route.ts:39`, `lib/server-api-base.ts:18-19`, `lib/server/magic-link.ts:29`.
- **What it controls**: The login URL embedded in magic-link emails.
- **When to set**: If magic-link URLs appear with the wrong host (e.g. when called from a cron context that has no request headers). For Vercel this is rare — the `host` header is always present in user-triggered requests.
- **Verdict**: ✅ Safe to leave unset.

### `WEBAUTHN_RP_ID`
- **Default**: `'realtynewsnow.app'`
- **Source**: `lib/server/webauthn-config.ts:23`.
- **When to set**: Only if you move the canonical domain.
- **Verdict**: ✅ Safe to leave unset.

### `WEBAUTHN_RP_NAME`
- **Default**: `'Realty News Now'`
- **Source**: `lib/server/webauthn-config.ts:27`.
- **What it does**: Human-readable name shown in OS passkey dialogs.
- **Verdict**: ✅ Safe to leave unset.

### `WEBAUTHN_ORIGIN`
- **Default**: `'https://realtynewsnow.app'`
- **Source**: `lib/server/webauthn-config.ts:31`.
- **Verdict**: ✅ Safe to leave unset.

### `WEBAUTHN_ADDITIONAL_RP_IDS` / `WEBAUTHN_ADDITIONAL_ORIGINS`
- **Default**: empty list — only the primary RP ID/origin is accepted.
- **Sources**: `lib/server/webauthn-config.ts:35,39`.
- **When to set**: If you accept passkey logins from additional hostnames (e.g. `app.myrealtyline.com`, `admin.realtynewsnow.app`). Comma-separated.
- **Verdict**: ✅ Safe to leave unset unless you have a secondary domain.

---

## 2. Vars auto-injected by the Vercel runtime (never set manually)

### `NODE_ENV`
- **Auto-set by**: Vercel build/runtime — `'production'` on prod deploys, `'development'` for `vercel dev`, `'production'` for preview deploys at runtime.
- **Sources**: `app/(dashboard)/dashboard/page.tsx:122`, `app/posthog-provider.tsx:29`, `lib/server/auth/cookies.ts:25` (gates `Secure` cookies), `lib/server/error.ts:41` (gates stack-trace exposure).
- **Verdict**: 🚫 Do not set manually — Vercel manages this.

### `VERCEL_ENV`
- **Auto-set by**: Vercel runtime — `'production'`, `'preview'`, or `'development'`.
- **Sources**: All cron scrapers (`app/api/cron/scrape-*.ts`) — used to gate scrapers so only production cron pings actually run scraping.
- **Verdict**: 🚫 Do not set manually.

---

## 3. Alias names for vars that ARE set in Vercel (under a different name)

These are alternate names the code accepts for backward compatibility. The
primary name is already set; the alias is redundant.

### `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
- **Aliases of**: `KV_REST_API_URL` / `KV_REST_API_TOKEN` (set by the Upstash marketplace integration, present in production + preview + development).
- **Source**: `lib/server/rate-limit.ts:40-41` — `const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL`.
- **Verdict**: ✅ Leave unset. `KV_REST_API_URL` is the canonical name on Vercel's marketplace integration.

### `RESEND_KEY`
- **Alias of**: `RESEND_API_KEY` (set in production + preview).
- **Source**: `app/api/admin/advertisers/{[id]/send-report,batch-report}/route.ts:25/27`, `r/advertiser/[slug]/request-access/route.ts:22` — `const RESEND_KEY = process.env.RESEND_API_KEY || process.env.RESEND_KEY`.
- **Verdict**: ✅ Leave unset.

### `RESEND_FROM_ADDRESS`
- **Alias of**: `EMAIL_FROM_ADDRESS` semantically, but **only consulted by `app/api/print-subscribe/route.ts:262`** which has its own hard-coded fallback `'Realty News Now <noreply@myrealtyline.com>'`.
- **Verdict**: ✅ Safe to leave unset. If you want print-subscribe notifications to come from `tawanna@myrealtyline.com` like everything else, set this to `Tawanna Verock, publisher <tawanna@myrealtyline.com>`.

### `RESEND_FROM_EMAIL`
- **Alias of**: `MAGIC_LINK_FROM_EMAIL` (which IS set in production + preview).
- **Source**: Advertiser routes fall back through `MAGIC_LINK_FROM_EMAIL || RESEND_FROM_EMAIL || 'hello@myrealtyline.com'`.
- **Verdict**: ✅ Leave unset.

---

## 4. What changed in this branch

- Added `EMAIL_PROVIDER=resend`, `EMAIL_FROM_ADDRESS=tawanna@myrealtyline.com`,
  `EMAIL_FROM_NAME="Tawanna Verock, publisher"` to Vercel (production + preview).
  Verified with a real password-reset send recorded as `provider=resend` in
  `email_log` at `2026-05-29 01:10:36 UTC`.
- Removed the orphan `REDIS_URL` env var (it was an Upstash-integration
  artefact that blocked the marketplace install, since re-injected by the
  integration during the project-connect step).
- DO droplet `caxton-api-prod` (104.131.176.86) and managed Postgres
  `caxton-prod-db` destroyed. No remaining references in code or env vars.

## 5. Recommended optional sets

If you want a tidier configuration with no behavioral change in steady state:

```
# Pin the WebAuthn origin explicitly (defensive against host-header spoofing)
WEBAUTHN_ORIGIN=https://realtynewsnow.app
WEBAUTHN_RP_ID=realtynewsnow.app
WEBAUTHN_RP_NAME=Realty News Now

# Pin the magic-link host (helps when triggered from cron/webhook contexts)
NEXT_PUBLIC_SITE_URL=https://realtynewsnow.app

# Consistent display name across advertiser-report and auth flows
MAGIC_LINK_FROM_NAME=Tawanna Verock, publisher

# Tidy print-subscribe sender (match auth-flow sender)
RESEND_FROM_ADDRESS=Tawanna Verock, publisher <tawanna@myrealtyline.com>
```

None of these are required. They make production behavior deterministic
regardless of request headers.

---

## Appendix — Variables you should NEVER set manually

| Var | Why |
|---|---|
| `NODE_ENV`, `VERCEL_ENV` | Auto-injected by Vercel runtime |
| `KV_*`, `REDIS_URL`, `KV_URL`, `KV_REST_API_*` | Owned by Upstash marketplace integration |
| `POSTGRES_*`, `PG*`, `DATABASE_URL_UNPOOLED`, `NEON_PROJECT_ID`, `BLOB_READ_WRITE_TOKEN` | Owned by Neon + Blob marketplace integrations |

Setting any of these by hand will desync from the integration the next time
it rotates credentials.
