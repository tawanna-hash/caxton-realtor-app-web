# Facebook Integration Setup

How to curate Facebook posts into the RealtyLine + Newsline feeds via
`/admin/social`. Two flows depending on where the post lives.

| Source | URL shape | Flow |
|---|---|---|
| **Page** (e.g. facebook.com/myrealtyline) | `…/posts/{id}` · `…/photos/{id}` · `?story_fbid=` | Auto-fetch via Graph API |
| **Group** (e.g. facebook.com/groups/350924882022474) | `…/groups/{id}/posts/{id}` | Manual entry (Meta retired the Groups API in April 2024) |

The admin form sniffs the pasted URL and picks the right flow automatically.

---

## Page posts — automated path

### What gets installed

| Env var | Required | Default | Used by |
|---|---|---|---|
| `FB_PAGE_ACCESS_TOKEN` | yes | — | `lib/server/facebook.ts` → Graph API |
| `FB_GRAPH_VERSION` | no | `v20.0` | Graph API version pin |

Set both in **Vercel → Project → Settings → Environment Variables** for
`production` and `preview`, then redeploy.

### Step 1 — Create (or reuse) a Meta Developer App

1. Go to <https://developers.facebook.com/apps/>.
2. **Create App** → use case **Other** → app type **Business**.
3. Name it `RealtyLine Social Reader` (or similar).
4. No Products needed — we only call the Graph API directly.

### Step 2 — Required permissions

Standard-access scopes on Pages **you administer**:

- `pages_read_engagement` — message + media + permalink + timestamp
- `pages_show_list` — lists Pages you can administer

No App Review needed as long as the token is used by you on Pages you own.

### Step 3 — Generate a long-lived Page Access Token

1. **Graph API Explorer**: <https://developers.facebook.com/tools/explorer/>
2. Top right: select your app.
3. Click **Generate Access Token** → grant `pages_read_engagement` +
   `pages_show_list`. You get a short-lived **User** token (~1 hour).
4. Exchange for a long-lived **User** token:
   ```bash
   curl -G "https://graph.facebook.com/v20.0/oauth/access_token" \
     --data-urlencode "grant_type=fb_exchange_token" \
     --data-urlencode "client_id=<APP_ID>" \
     --data-urlencode "client_secret=<APP_SECRET>" \
     --data-urlencode "fb_exchange_token=<SHORT_LIVED_USER_TOKEN>"
   ```
   Returns a `<LONG_LIVED_USER_TOKEN>` good for ~60 days.
5. Trade it for a long-lived **Page** token (these effectively never expire as
   long as your password / 2FA stays valid):
   ```bash
   curl -G "https://graph.facebook.com/v20.0/me/accounts" \
     --data-urlencode "access_token=<LONG_LIVED_USER_TOKEN>"
   ```
   Response:
   ```json
   {
     "data": [
       {
         "id": "1234567890",
         "name": "RealtyLine Austin",
         "access_token": "EAAB…long…token…XYZ",
         "category": "Magazine"
       }
     ]
   }
   ```
   Copy the Page's `access_token`.

### Step 4 — Add to Vercel

```bash
vercel env add FB_PAGE_ACCESS_TOKEN production
# paste the Page access token

vercel env add FB_GRAPH_VERSION production
# v20.0   (optional)
```

Trigger a redeploy.

### Step 5 — Verify

```bash
# Token works
curl -G "https://graph.facebook.com/v20.0/me" \
  --data-urlencode "access_token=$FB_PAGE_ACCESS_TOKEN"
# → { "name": "RealtyLine Austin", "id": "1234567890" }

# Fetch a real post
curl -G "https://graph.facebook.com/v20.0/<PAGE_ID>_<POST_ID>" \
  --data-urlencode "fields=id,message,permalink_url,created_time,full_picture" \
  --data-urlencode "access_token=$FB_PAGE_ACCESS_TOKEN"
```

Then in the admin app:

1. Go to `/admin/social`.
2. Paste any Facebook **Page** post URL — supported shapes:
   - `https://www.facebook.com/myrealtyline/posts/<id>`
   - `https://www.facebook.com/myrealtyline/photos/<id>`
   - `https://www.facebook.com/permalink.php?story_fbid=<id>&id=<page>`
3. Form should show **✓ Page URL detected**.
4. Pick publication, check Open House if pinning, submit.
5. Card appears in the feed within seconds.

---

## Group posts — manual path

Meta deprecated the Groups API on April 22, 2024. There is **no supported
way** to read group post content programmatically anymore — not even as a
group admin. Curation is manual.

### How to add a group post

1. Open the group post on facebook.com.
2. Copy the URL from the address bar — it should look like
   `https://www.facebook.com/groups/<groupId>/posts/<postId>/`
3. In `/admin/social`, paste the URL. The form switches into manual mode and
   shows an amber panel.
4. Fill in:
   - **Caption** — copy/paste the post text from Facebook.
   - **Image** — right-click the photo on Facebook → Save image → upload here
     (PNG/JPG/WebP/GIF, ≤ 10 MB). Stored in Vercel Blob.
   - **Posted at** (optional) — original FB post timestamp; powers the
     "2h ago" label on the feed card.
5. Pick publication + Open House flag, submit.

Group posts skip the daily refresh cron (nothing to refresh against), so
edits are sticky until you delete or update them by hand.

---

## How fresh data stays fresh

Daily cron `/api/cron/refresh-social` (`0 9 * * *` UTC):

- For Page posts → re-fetches message / image / permalink via Graph API,
  bumps `refreshed_at`.
- For Group posts → skipped entirely.
- 4xx Graph API errors on Page posts (deleted, permissions revoked) are
  logged; the row stays in the admin list so you can investigate.

## Rotating the token

Page tokens minted from a long-lived user token are effectively permanent.
If you change your Facebook password, revoke app access, or deauthorize the
app, the token dies. To rotate:

1. Repeat **Step 3**.
2. Update `FB_PAGE_ACCESS_TOKEN` in Vercel.
3. Redeploy.

No code change needed.

## Troubleshooting

| Error in `/admin/social` POST | Cause |
|---|---|
| `FB_PAGE_ACCESS_TOKEN is not configured` | Env var missing in this Vercel env, or deploy hasn't rolled. Page flow only. |
| `Could not parse Facebook URL` | URL shape isn't one of `/posts/`, `/photos/`, `?story_fbid=`, or `/groups/…/posts/`. Paste the full URL. |
| `Group home URL detected` | You pasted `…/groups/<id>/` instead of `…/groups/<id>/posts/<postId>/`. Click into the post first. |
| `Group posts require either a caption or an image` | Manual fields are required for the group path. |
| `Facebook API error (190)` | Token expired or invalid. Re-run Step 3. |
| `Facebook API error (100)` | Post ID doesn't belong to a Page your token administers. |
| `Facebook API error (200)` | Page hasn't granted `pages_read_engagement`. Re-run Steps 2 + 3. |
