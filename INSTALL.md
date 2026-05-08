# Daily Unlock MLS Sync — Vercel Install Guide

This bundle drops everything needed for the daily Unlock MLS event sync into
your existing `caxton-realtor-app-web` Vercel project. No DigitalOcean. No
separate backend service. The `caxton-realtor-api` repo stays dormant.

## What it does

- Adds a Postgres `events` table inside a Vercel Postgres database
- Adds two API routes: `/api/events/[publication]` (read) and
  `/api/cron/scrape-unlockmls` (the daily scraper)
- Vercel Cron triggers the scraper at **11:00 UTC every day** (= 6 AM Central
  during DST, 5 AM during Standard Time)
- Updates the dashboard's events fetch to use the new local API route

## What's in this bundle

```
vercel.json                              NEW — cron config
lib/db.ts                                NEW — Postgres client
lib/events-store.ts                      NEW — DB read/write
lib/unlockmls-scraper.ts                 NEW — TS port of the scraper
app/api/events/[publication]/route.ts    NEW — public read API
app/api/cron/scrape-unlockmls/route.ts   NEW — cron-triggered scrape
install/patch-dashboard.py               NEW — patches the dashboard fetch
INSTALL.md                               NEW — this file
```

## Walkthrough

We'll do this together. Each step is intentionally small.

### 1. Drop the bundle into your repo

```bash
cd ~/caxton-realtor-app-web   # adjust path if different
unzip -o ~/Downloads/caxton-vercel-sync.zip -d .
```

Expected output: a list of `inflating:` lines. No errors.

Sanity check:

```bash
ls vercel.json
ls lib/unlockmls-scraper.ts
ls "app/api/events/[publication]/route.ts"
```

All three should print their filenames.

### 2. Patch the dashboard

```bash
python3 install/patch-dashboard.py
```

You should see:
```
Fetch URL: patched (now uses /api/events/...)
Date fallback: patched (fixes pre-existing strict-mode TS error)
```

(If it says "already patched" for either, that's fine — it's idempotent.)

### 3. Install the new npm dependencies

```bash
npm install @neondatabase/serverless cheerio
```

This adds two packages: a Postgres client and an HTML parser the scraper
needs.

### 4. Add Postgres to the Vercel project

This part you do in your browser:

1. Go to https://vercel.com/dashboard and open the
   **caxton-realtor-app-web** project
2. Click the **Storage** tab in the top nav
3. Click **Create Database** → choose **Postgres**
4. Pick a region close to your users (US East / Washington D.C. is fine)
5. Click **Create**
6. When it asks if you want to connect it to this project, say **Yes**
7. Vercel will inject `DATABASE_URL`, `POSTGRES_URL`, and a few related env
   vars automatically — you don't need to copy/paste anything

### 5. Add the CRON_SECRET environment variable

This is the bearer token Vercel will send when triggering the cron, so the
endpoint can verify it's a legitimate Vercel call.

First, generate one in Terminal:

```bash
openssl rand -hex 32
```

Copy the 64-char string (don't paste it in chat — keep it private).

Then in Vercel:
1. Open the **caxton-realtor-app-web** project
2. **Settings** (top nav) → **Environments** (left sidebar) → click
   **Production**
3. Scroll to **Environment Variables**
4. Click **Add Environment Variable**
5. Key: `CRON_SECRET`, Value: paste the token, Environment: Production +
   Preview, Sensitive: yes
6. Click **Save**

### 6. Commit and push

```bash
git checkout -b add-unlockmls-sync
git add .
git commit -m "Add daily Unlock MLS event sync"
git push -u origin add-unlockmls-sync
```

Open a pull request on GitHub and merge it to `main`. Vercel will auto-deploy
within ~1–2 minutes.

### 7. Trigger the first sync manually

The Vercel cron is registered to run at 11 UTC daily, but you don't want to
wait. To trigger it now:

1. Go to your Vercel project → **Deployments** → click the latest production
   deployment
2. Click **Logs** (top right) → leave it open in a tab so you can watch
3. In a new tab, open Terminal and run (replace `YOUR_CRON_SECRET`):

```bash
curl -i -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://app.myrealtyline.com/api/cron/scrape-unlockmls
```

Within 60–90 seconds you should see a JSON response like:
```json
{"ok":true,"months":3,"received":61,"inserted":61,"updated":0,"pruned":0,"durationMs":42500}
```

Watch the Logs tab — you'll see scrape progress messages.

### 8. Check the calendar in the app

Open https://app.myrealtyline.com, switch to RealtyLine, tap **Calendar**.
You should see the Unlock MLS events with proper dates, times, prices, and
locations.

## After it's running

- **The cron fires daily at 11 UTC** (6 AM CDT / 5 AM CST). To change the
  schedule, edit `vercel.json` and redeploy.
- **The scrape runs against `unlockmls.com`** — if Unlock MLS makes
  significant changes to their HTML, the parser may need updates. The
  scraper handles missing fields gracefully (writes nulls) but if event
  count drops to 0 unexpectedly, that's the first thing to check.
- **The Postgres table caps at the events you've seen** — past events are
  kept for history, future events that get cancelled upstream are pruned
  automatically on the next sync.
- **Manual triggers** are always safe via the curl command in step 7.

## Verify it's working

A few useful debugging URLs (must include the auth header for the cron one):

- `https://app.myrealtyline.com/api/events/austin` — public, returns the
  list of events the dashboard sees
- `https://app.myrealtyline.com/api/events/san_antonio` — same for
  Newsline (will be empty — no scraper feeds this market yet)

To inspect the DB directly:
1. Vercel project → Storage → click your Postgres database
2. **Data** tab → run a query like `SELECT title, start_date FROM events
   ORDER BY start_date LIMIT 20;`

## Rollback

If anything goes wrong, you can disable the daily sync without losing data:

- **Disable the cron**: edit `vercel.json` and change the `cron` field
  to a far-future schedule, or delete `vercel.json`. Push. Cron stops.
- **Revert the deploy**: in Vercel, go to **Deployments** → find a working
  deployment from before the change → click ⋯ → **Promote to Production**.
- **Delete the table**: in the Vercel Postgres data tab, run
  `DROP TABLE events;`. The next deploy will recreate it empty.

## Need to change anything?

- **Different time of day**: edit the `schedule` field in `vercel.json`.
  Format is standard cron in UTC. Run http://crontab.guru if you need help.
- **Look further ahead than 3 months**: edit `lib/unlockmls-scraper.ts`
  default in `scrapeUnlockMls(months = 3)`, or pass `?months=6` to the cron
  URL.
- **Different prefix than "ABOR: "**: edit `EVENT_NAME_PREFIX` at the top
  of `lib/unlockmls-scraper.ts`.
