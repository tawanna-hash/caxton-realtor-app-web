# Environment Variable Audit — caxton-realtor-app-web

_Generated 2026-05-28 20:01 CDT. Vercel project `prj_bTASRe9CPDIVRJevjgnaHRWnii15`, team `team_8r1L4Gvcdj3teuOF2Y4XeofK`._

## Summary

- Keys referenced in code: **41**
- Keys set in Vercel:      **33**
- **FAIL** (will break runtime/build): **0**
- **WARN** (silent bug or stale config): **2**
- **OK**: **55**

## Action items

### Likely live issue — magic links and password resets are silently logging instead of sending

Neither `EMAIL_PROVIDER` nor `EMAIL_FROM_ADDRESS` is currently set in Vercel.
`lib/server/email/index.ts:15` defaults to `'console'` when `EMAIL_PROVIDER`
is unset, which means every call to `getEmailProvider().send()` (used by
magic-link signup/login, admin and public forgot-password, giveaway draw
notifications) writes the rendered HTML to `console.log` instead of POSTing
to Resend.

**`email_log` shows the inconsistency:**

| email_type | provider | count | last_sent |
|---|---|---:|---|
| password_reset | resend | 6 | 2026-05-18 |
| admin_password_reset | resend | 5 | 2026-05-17 |
| login | resend | 16 | 2026-05-16 |
| signup_verification | console | 1 | 2026-05-07 |

The `provider=resend` rows mean `EMAIL_PROVIDER=resend` (and
`EMAIL_FROM_ADDRESS`) **were** set previously and produced real sends through
mid-May, but have since been removed from the project. The next time a user
triggers a magic link on production, the email will silently go to the lambda
stdout. Re-add both:

```
EMAIL_PROVIDER       = resend                              (production, preview)
EMAIL_FROM_ADDRESS   = hello@myrealtyline.com  (or your actual verified sender)  (production, preview)
EMAIL_FROM_NAME      = Realty News Now        (optional but recommended)         (production, preview)
```

`RESEND_API_KEY` is still set, so once `EMAIL_PROVIDER=resend` flips back on
and the from-address is configured, sends resume immediately on the next
deploy/lambda cold-start.

### No build-breaking FAIL issues

Every critical variable (`JWT_SECRET`, `DATABASE_URL`, `RESEND_API_KEY`,
`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `MAGIC_LINK_FROM_EMAIL`) is set in
both `production` and `preview`.

### WARN — review

- **`EMAIL_FROM_ADDRESS`** — no default; `ResendEmailProvider.send()` returns
  an error if missing. Required when `EMAIL_PROVIDER=resend`. Affects:
  magic-link, password reset, giveaway draw.
- **`EMAIL_PROVIDER`** — code defaults to `'console'` (logs instead of sends).
  Set to `resend` in production + preview.

## Full matrix

Legend: `✓` = set in that environment. `·` = not set. **SENS** = stored as Vercel sensitive. **REFs** = number of source files referencing the var.

| Verdict | Key | REFs | PROD | PREV | DEV | SENS | Type | Notes |
|---|---|---:|:---:|:---:|:---:|:---:|---|---|
| WARN | `EMAIL_FROM_ADDRESS` | 2 | · | · | · | n | MISSING | no default — ResendEmailProvider.send() returns error if missing. Must be set when EMAIL_PROVIDER=resend. Currently affects: magic-link, password reset, giveaway emails. |
| WARN | `EMAIL_PROVIDER` | 1 | · | · | · | n | MISSING | code defaults to 'console' provider — emails silently log instead of sending. Set EMAIL_PROVIDER=resend in production to actually send. |
| OK | `APP_URL` | 3 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `BLOB_READ_WRITE_TOKEN` | 0 | ✓ | ✓ | ✓ | n | encrypted | auto-injected by Neon integration; unused but harmless |
| OK | `CRON_SECRET` | 8 | ✓ | · | · | Y | sensitive | intentionally prod-only |
| OK | `DATABASE_URL` | 6 | ✓ | ✓ | · | Y | sensitive | critical, set in prod+preview |
| OK | `DATABASE_URL_UNPOOLED` | 0 | ✓ | ✓ | · | Y | sensitive | auto-injected by Neon integration; unused but harmless |
| OK | `EMAIL_FROM_NAME` | 2 | · | · | · | n | MISSING | optional (sender uses bare email if unset) |
| OK | `EMAIL_REPLY_TO` | 1 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `INVENTORY_NOTIFY_TO` | 1 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `JWT_EXPIRY` | 1 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `JWT_SECRET` | 2 | ✓ | ✓ | · | Y | sensitive | critical, set in prod+preview |
| OK | `KV_REST_API_READ_ONLY_TOKEN` | 0 | ✓ | ✓ | ✓ | n | encrypted | auto-injected by Upstash integration; alt to KV_REST_* |
| OK | `KV_REST_API_TOKEN` | 1 | ✓ | ✓ | ✓ | n | encrypted | critical, set in prod+preview |
| OK | `KV_REST_API_URL` | 1 | ✓ | ✓ | ✓ | n | encrypted | critical, set in prod+preview |
| OK | `KV_URL` | 0 | ✓ | ✓ | ✓ | n | encrypted | auto-injected by Upstash integration; alt to KV_REST_* |
| OK | `LOG_LEVEL` | 1 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `MAGIC_LINK_EXPIRY_MINUTES` | 2 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `MAGIC_LINK_FROM_EMAIL` | 3 | ✓ | ✓ | · | n | encrypted | critical, set in prod+preview |
| OK | `MAGIC_LINK_FROM_NAME` | 3 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `NEON_PROJECT_ID` | 0 | ✓ | ✓ | · | Y | sensitive | auto-injected by Neon integration; unused but harmless |
| OK | `NEXT_PUBLIC_APP_URL` | 3 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `NEXT_PUBLIC_POSTHOG_HOST` | 1 | ✓ | ✓ | · | Y | sensitive | set in prod+preview |
| OK | `NEXT_PUBLIC_POSTHOG_KEY` | 1 | ✓ | ✓ | · | Y | sensitive | set in prod+preview |
| OK | `NEXT_PUBLIC_SITE_URL` | 4 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `NODE_ENV` | 4 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `PGDATABASE` | 0 | ✓ | ✓ | · | Y | sensitive | auto-injected by Neon integration; unused but harmless |
| OK | `PGHOST` | 0 | ✓ | ✓ | · | Y | sensitive | auto-injected by Neon integration; unused but harmless |
| OK | `PGHOST_UNPOOLED` | 0 | ✓ | ✓ | · | Y | sensitive | auto-injected by Neon integration; unused but harmless |
| OK | `PGPASSWORD` | 0 | ✓ | ✓ | · | Y | sensitive | auto-injected by Neon integration; unused but harmless |
| OK | `PGUSER` | 0 | ✓ | ✓ | · | Y | sensitive | auto-injected by Neon integration; unused but harmless |
| OK | `POSTGRES_DATABASE` | 0 | ✓ | ✓ | · | Y | sensitive | auto-injected by Neon integration; unused but harmless |
| OK | `POSTGRES_HOST` | 0 | ✓ | ✓ | · | Y | sensitive | auto-injected by Neon integration; unused but harmless |
| OK | `POSTGRES_PASSWORD` | 0 | ✓ | ✓ | · | Y | sensitive | auto-injected by Neon integration; unused but harmless |
| OK | `POSTGRES_PRISMA_URL` | 2 | ✓ | ✓ | · | Y | sensitive | set in prod+preview |
| OK | `POSTGRES_URL` | 3 | ✓ | ✓ | · | Y | sensitive | set in prod+preview |
| OK | `POSTGRES_URL_NON_POOLING` | 2 | ✓ | ✓ | · | Y | sensitive | set in prod+preview |
| OK | `POSTGRES_URL_NO_SSL` | 0 | ✓ | ✓ | · | Y | sensitive | auto-injected by Neon integration; unused but harmless |
| OK | `POSTGRES_USER` | 0 | ✓ | ✓ | · | Y | sensitive | auto-injected by Neon integration; unused but harmless |
| OK | `POSTHOG_PERSONAL_API_KEY` | 6 | ✓ | ✓ | ✓ | n | encrypted | set in prod+preview |
| OK | `POSTHOG_PROJECT_ID` | 5 | ✓ | ✓ | · | Y | sensitive | set in prod+preview |
| OK | `REDIS_URL` | 0 | ✓ | ✓ | ✓ | n | encrypted | auto-injected by Upstash integration; alt to KV_REST_* |
| OK | `RESEND_API_KEY` | 6 | ✓ | ✓ | · | n | encrypted | critical, set in prod+preview |
| OK | `RESEND_FROM_ADDRESS` | 1 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `RESEND_FROM_EMAIL` | 3 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `RESEND_KEY` | 3 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `SUBSCRIBE_NOTIFY_TO` | 1 | ✓ | · | · | n | encrypted | intentionally prod-only |
| OK | `UPSTASH_REDIS_REST_TOKEN` | 1 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `UPSTASH_REDIS_REST_URL` | 1 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `USPS_CONSUMER_KEY` | 1 | ✓ | · | · | Y | sensitive | intentionally prod-only |
| OK | `USPS_CONSUMER_SECRET` | 1 | ✓ | · | · | Y | sensitive | intentionally prod-only |
| OK | `VERCEL_ENV` | 5 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `WEBAUTHN_ADDITIONAL_ORIGINS` | 1 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `WEBAUTHN_ADDITIONAL_RP_IDS` | 1 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `WEBAUTHN_ORIGIN` | 1 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `WEBAUTHN_RP_ID` | 1 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |
| OK | `WEBAUTHN_RP_NAME` | 1 | · | · | · | n | MISSING | code has default; missing in Vercel is fine |

## Where each var is referenced

| Key | Files |
|---|---|
| `APP_URL` | `app/api/admin/advertisers/[id]/send-report/route.ts`<br>`app/api/admin/advertisers/batch-report/route.ts`<br>`app/api/r/advertiser/[slug]/request-access/route.ts` |
| `CRON_SECRET` | `app/api/cron/scrape-david-weekley/route.ts`<br>`app/api/cron/scrape-fpr/route.ts`<br>`app/api/cron/scrape-giddens/route.ts`<br>`app/api/cron/scrape-hba/route.ts`<br>`app/api/cron/scrape-kb-home/route.ts`<br>`app/api/cron/scrape-mi-homes-incentives/route.ts`<br>`app/api/cron/scrape-mi-homes/route.ts`<br>`app/api/cron/scrape-unlockmls/route.ts` |
| `DATABASE_URL` | `app/api/admin/inventory/route.ts`<br>`app/api/inventory/submit/route.ts`<br>`lib/builder-inventory.ts`<br>`lib/builder-slug-server.ts`<br>`lib/db.ts`<br>`lib/server/db/neon.ts` |
| `EMAIL_FROM_ADDRESS` | `lib/server/email/resend-provider.ts`<br>`lib/server/email/templates.ts` |
| `EMAIL_FROM_NAME` | `lib/server/email/resend-provider.ts`<br>`lib/server/email/templates.ts` |
| `EMAIL_PROVIDER` | `lib/server/email/index.ts` |
| `EMAIL_REPLY_TO` | `lib/server/email/resend-provider.ts` |
| `INVENTORY_NOTIFY_TO` | `app/api/inventory/submit/route.ts` |
| `JWT_EXPIRY` | `lib/server/jwt.ts` |
| `JWT_SECRET` | `lib/server/jwt.ts`<br>`proxy.ts` |
| `KV_REST_API_TOKEN` | `lib/server/rate-limit.ts` |
| `KV_REST_API_URL` | `lib/server/rate-limit.ts` |
| `LOG_LEVEL` | `lib/server/logger.ts` |
| `MAGIC_LINK_EXPIRY_MINUTES` | `app/api/auth/signup/route.ts`<br>`lib/server/magic-link.ts` |
| `MAGIC_LINK_FROM_EMAIL` | `app/api/admin/advertisers/[id]/send-report/route.ts`<br>`app/api/admin/advertisers/batch-report/route.ts`<br>`app/api/r/advertiser/[slug]/request-access/route.ts` |
| `MAGIC_LINK_FROM_NAME` | `app/api/admin/advertisers/[id]/send-report/route.ts`<br>`app/api/admin/advertisers/batch-report/route.ts`<br>`app/api/r/advertiser/[slug]/request-access/route.ts` |
| `NEXT_PUBLIC_APP_URL` | `app/api/admin/advertisers/[id]/send-report/route.ts`<br>`app/api/admin/advertisers/batch-report/route.ts`<br>`app/api/r/advertiser/[slug]/request-access/route.ts` |
| `NEXT_PUBLIC_POSTHOG_HOST` | `app/posthog-provider.tsx` |
| `NEXT_PUBLIC_POSTHOG_KEY` | `app/posthog-provider.tsx` |
| `NEXT_PUBLIC_SITE_URL` | `app/api/admin/auth/forgot-password/route.ts`<br>`app/api/auth/forgot-password/route.ts`<br>`lib/server-api-base.ts`<br>`lib/server/magic-link.ts` |
| `NODE_ENV` | `app/(dashboard)/dashboard/page.tsx`<br>`app/posthog-provider.tsx`<br>`lib/server/auth/cookies.ts`<br>`lib/server/error.ts` |
| `POSTGRES_PRISMA_URL` | `lib/db.ts`<br>`lib/server/db/neon.ts` |
| `POSTGRES_URL` | `app/api/inventory/submit/route.ts`<br>`lib/db.ts`<br>`lib/server/db/neon.ts` |
| `POSTGRES_URL_NON_POOLING` | `lib/db.ts`<br>`lib/server/db/neon.ts` |
| `POSTHOG_PERSONAL_API_KEY` | `app/api/admin/analytics/posthog/route.ts`<br>`app/api/admin/metrics/route.ts`<br>`app/api/admin/reports/article/route.ts`<br>`app/api/admin/reports/articles-list/route.ts`<br>`app/api/admin/reports/event/route.ts`<br>`app/api/admin/reports/events-list/route.ts` |
| `POSTHOG_PROJECT_ID` | `app/api/admin/metrics/route.ts`<br>`app/api/admin/reports/article/route.ts`<br>`app/api/admin/reports/articles-list/route.ts`<br>`app/api/admin/reports/event/route.ts`<br>`app/api/admin/reports/events-list/route.ts` |
| `RESEND_API_KEY` | `app/api/admin/advertisers/[id]/send-report/route.ts`<br>`app/api/admin/advertisers/batch-report/route.ts`<br>`app/api/inventory/submit/route.ts`<br>`app/api/print-subscribe/route.ts`<br>`app/api/r/advertiser/[slug]/request-access/route.ts`<br>`lib/server/email/resend-provider.ts` |
| `RESEND_FROM_ADDRESS` | `app/api/print-subscribe/route.ts` |
| `RESEND_FROM_EMAIL` | `app/api/admin/advertisers/[id]/send-report/route.ts`<br>`app/api/admin/advertisers/batch-report/route.ts`<br>`app/api/r/advertiser/[slug]/request-access/route.ts` |
| `RESEND_KEY` | `app/api/admin/advertisers/[id]/send-report/route.ts`<br>`app/api/admin/advertisers/batch-report/route.ts`<br>`app/api/r/advertiser/[slug]/request-access/route.ts` |
| `SUBSCRIBE_NOTIFY_TO` | `app/api/print-subscribe/route.ts` |
| `UPSTASH_REDIS_REST_TOKEN` | `lib/server/rate-limit.ts` |
| `UPSTASH_REDIS_REST_URL` | `lib/server/rate-limit.ts` |
| `USPS_CONSUMER_KEY` | `app/api/print-subscribe/route.ts` |
| `USPS_CONSUMER_SECRET` | `app/api/print-subscribe/route.ts` |
| `VERCEL_ENV` | `app/api/cron/scrape-david-weekley/route.ts`<br>`app/api/cron/scrape-giddens/route.ts`<br>`app/api/cron/scrape-kb-home/route.ts`<br>`app/api/cron/scrape-mi-homes-incentives/route.ts`<br>`app/api/cron/scrape-mi-homes/route.ts` |
| `WEBAUTHN_ADDITIONAL_ORIGINS` | `lib/server/webauthn-config.ts` |
| `WEBAUTHN_ADDITIONAL_RP_IDS` | `lib/server/webauthn-config.ts` |
| `WEBAUTHN_ORIGIN` | `lib/server/webauthn-config.ts` |
| `WEBAUTHN_RP_ID` | `lib/server/webauthn-config.ts` |
| `WEBAUTHN_RP_NAME` | `lib/server/webauthn-config.ts` |

## Methodology

- **Code sweep**: regex `process\.env\.[A-Z][A-Z0-9_]+` and `process\.env[\['"][A-Z][A-Z0-9_]+['"]\]` across `*.ts`, `*.tsx`, `*.js`, `*.mjs`, `*.cjs`, `*.json` in the repo, excluding `node_modules`, `.next`, `.git`, `dist`.
- **Vercel inventory**: `GET /v9/projects/{project}/env?teamId=...` (33 entries).
- **Sensitive flag**: any entry with `type: "sensitive"` (Vercel encrypts these and never reveals plaintext after creation).
- **Fallback chains verified manually** for: `MAGIC_LINK_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL`, `APP_URL`/`NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`/`RESEND_KEY`, `POSTGRES_*` (used in fallback chain in `lib/db.ts`).