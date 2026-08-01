# Gmail Event Scanner

Reads the connected Gmail mailbox for event announcements sent by advertisers
and curated real-estate associations, runs each message through Gemini, and
queues every detection as a hidden event for admin review. Approving a queued
event flips `hidden=false` and it appears on the public calendar for its
publication.

Nothing is published without a human approving it.

```
Gmail  ──►  scanner  ──►  Gemini  ──►  events (hidden=true, external_source='gmail')
                                             │
                              /admin/events/gmail  ──approve──►  /calendar/{publication}
```

## Moving parts

| Path | Role |
|---|---|
| `lib/server/gmail-client.ts` | OAuth consent URL, code exchange, token storage, authenticated `gmail` v1 client with auto-refresh |
| `lib/server/gemini-email-events-extract.ts` | Gemini prompt + JSON schema for one email |
| `lib/server/gmail-event-scanner.ts` | `scanGmailForEvents()` — domain list, Gmail search, body extraction, publication detection, date parsing, insert |
| `app/api/cron/scan-gmail/route.ts` | Daily Vercel Cron entry point (16:00 UTC) |
| `app/admin/events/gmail/page.tsx` | Review queue UI |
| `event_source_orgs` table | Curated association sending domains |
| `gmail_oauth_tokens` table | The single connected mailbox |

Both tables are created and seeded by `ensureSchema()` in `lib/db.ts` on cold
start. There is no migration step.

## 1. Google Cloud OAuth setup

One-time, in the Google Cloud project that will own the OAuth client.

1. **Enable the Gmail API** — Google Cloud Console → APIs & Services → Library →
   search "Gmail API" → **Enable**.
2. **Configure the OAuth consent screen** — APIs & Services → OAuth consent
   screen.
   - User type **External** (unless the mailbox is on a Workspace domain you
     own, in which case **Internal** avoids the verification prompts).
   - Add the scope `https://www.googleapis.com/auth/gmail.readonly`. This is a
     restricted scope: while the app is in **Testing** you must add the mailbox
     address under **Test users**, and refresh tokens expire after 7 days.
     Publish the app to remove both limits.
3. **Create the OAuth client** — APIs & Services → Credentials → Create
   credentials → **OAuth client ID** → Application type **Web application**.
   - Authorized redirect URI:
     `https://realtynewsnow.app/api/admin/gmail-auth/callback`
   - Add a second URI for any other host you connect from (preview deploys,
     `http://localhost:3000/api/admin/gmail-auth/callback` for local work).
     Google requires an exact match.
4. Copy the client ID and secret into Vercel.

## 2. Environment variables

| Var | Required | Notes |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | yes | From step 3 above |
| `GOOGLE_OAUTH_CLIENT_SECRET` | yes | Secret — Vercel only |
| `GOOGLE_OAUTH_REDIRECT_URI` | recommended | Falls back to `NEXT_PUBLIC_SITE_URL`, then `VERCEL_URL`. Set it explicitly so it can't drift from the value registered with Google |
| `GEMINI_API_KEY` | yes | Already set; shared with the other Gemini extractors |
| `GEMINI_TEXT_MODEL` | no | Defaults to `GEMINI_VISION_MODEL`, then `gemini-2.5-flash` |
| `CRON_SECRET` | yes | Already set. The cron route returns 503 if it is missing rather than exposing an open scan trigger |

If the OAuth vars are absent the admin page shows a banner and the cron logs a
warning; no other surface is affected.

## 3. Connect the mailbox

1. Go to **/admin/events/gmail**.
2. Click **Connect Gmail** and complete Google's consent screen as the mailbox
   that receives advertiser and association mail.
3. You land back on the page with a green "Connected as …" row.

The callback stores the refresh token in `gmail_oauth_tokens`. Only one mailbox
is connected at a time — reconnecting overwrites the row.

Access tokens refresh automatically and the refreshed value is persisted, so
this is a one-time step. Reconnect if you see auth errors during a scan, if the
mailbox password changes, or if access was revoked from the Google account's
security settings.

## 4. Run a scan

**From the UI** — click **Scan now**. It scans the last 30 days inline (up to
300s) and reports counts in a toast: messages read, events detected, events
queued, plus skipped-as-duplicate / skipped-for-no-date / errored.

**Scheduled** — Vercel Cron hits `/api/cron/scan-gmail` daily at 16:00 UTC
(see `vercel.json`), over a 30-day rolling window. The wide overlap covers
missed runs and back-dated newsletters that mention an event weeks before it
happens; already-scanned messages are skipped before the Gemini call, so
re-reading the same month every day is nearly free.

**By hand** —

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://realtynewsnow.app/api/cron/scan-gmail?days=60"
```

`days` is clamped to 1–90, so a one-off backfill can reach further back than
the daily window.

**Dry run** — `scanGmailForEvents({ lookbackDays: 7, dryRun: true })` parses and
returns candidates without writing anything. Useful when tuning the prompt or
adding a new source domain.

### What gets scanned

The allowed-sender list is the union of:

- active rows in `event_source_orgs` (association domains), and
- the domain of every `advertisers.contact_email`.

Anything from another domain is never read. Matching covers subdomains, so
`abor.com` also matches `mail.abor.com`.

### Idempotency

`external_id` is `gmail-<messageId>` (with a `-<n>` suffix when one email
contains several events), and `events` has a unique constraint on
`(external_source, external_id)`. A message can be scanned repeatedly without
producing duplicates.

## 5. Seeding `event_source_orgs`

Seeded on cold start with the associations below, via
`INSERT ... ON CONFLICT (domain) DO NOTHING` — editing or deactivating a row in
the database will not be undone by a later deploy.

| Name | Domain | Default publication |
|---|---|---|
| Austin Board of REALTORS | `abor.com` | austin |
| Five Points Board of REALTORS | `fivepointsrealtors.com` | austin |
| HBA Austin | `hbaaustin.com` | austin |
| Realty Austin | `realtyaustin.com` | austin |
| WCR Austin | `wcraustin.com` | austin |
| NAHREP | `nahrep.org` | austin |
| AREAA | `areaa.org` | austin |
| Texas REALTORS | `texasrealestate.com` | austin |
| SABOR | `sabor.com` | san_antonio |

Domains are matched per-domain, not per-address, so every mailbox at a listed
domain (`communications@abor.com`, `events@abor.com`, …) is already covered by
its single row.

Three rows need confirmation against real mail:

- `wcraustin.com` is a best guess — WCR chapters have used both `wcr.org`
  subdomains and standalone chapter sites.
- `realtyaustin.com` — Realty Austin merged into Compass RE Texas in 2023 and
  the domain may only forward. If their mail arrives from `@compass.com`, add
  that domain instead.
- `hbaaustin.com` overlaps the existing `scrape-hba` cron, which already pulls
  HBA's public calendar as `external_source='hba'`. Gmail is here to catch
  promo and mailing-list events that never reach that calendar; expect the odd
  near-duplicate in the queue, since the two sources have separate
  `external_id` namespaces and cannot dedupe against each other.

Add a source:

```sql
INSERT INTO event_source_orgs (name, domain, default_publication)
VALUES ('Austin Mortgage Bankers Association', 'ambaustin.org', 'austin')
ON CONFLICT (domain) DO NOTHING;
```

Stop scanning a source without losing the row:

```sql
UPDATE event_source_orgs SET active = false WHERE domain = 'nahrep.org';
```

`default_publication` is only the fallback. The scanner first looks for
city/market keywords in the email (San Antonio terms are checked before Austin,
because Austin terms leak into statewide mail) and uses this column only when
nothing matches. Reviewers can override the publication per row in the queue.

## 6. Reviewing

At **/admin/events/gmail**, each row shows the event, parsed date, location,
host, auto-detected publication, sender, and Gemini's confidence.

- **Source Email** opens a drawer with the original message. The body is fetched
  from Gmail on demand rather than stored — it is only ever read during review.
- **Publication** is a dropdown; switching it saves immediately.
- **Approve** publishes to the public calendar for that publication.
- **Edit** opens the standard event editor at `/admin/events/[id]`.
- **Reject** deletes the queued row. The message stays marked as scanned, so it
  will not come back on the next run.

Events whose date Gemini could not resolve show **Date TBD**; the raw date text
is kept in the description so a reviewer can fix it in the editor before
approving.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` on connect | The URI in `GOOGLE_OAUTH_REDIRECT_URI` (or the derived one) is not registered on the OAuth client, character for character |
| Connect succeeds, scans fail days later | App is in Testing mode — refresh tokens expire after 7 days. Publish the consent screen |
| `No Gmail mailbox is connected` | `gmail_oauth_tokens` is empty; connect the mailbox |
| Scan reads 0 messages | No sender domain matched, or the lookback is too short. Check `event_source_orgs.active` and that advertisers have `contact_email` set |
| Everything detected, nothing inserted | Usually all duplicates — check `skippedDuplicate` in the response |
| Cron returns 503 `cron_secret_missing` | `CRON_SECRET` is unset on the deployment |
