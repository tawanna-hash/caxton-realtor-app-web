
---

## [S15+] Fix article_opened tracking — title and pub are null in PostHog

**Severity:** High — blocks usable client reports
**Discovered:** S14, 2026-05-15 14:10 via /admin/reports smoke test
**File:** `app/(dashboard)/dashboard/page.tsx:624`

**Symptom:** Every article in `/admin/reports` dropdown shows as `[?] (untitled) · N opens`. The `article_opened` event in PostHog records `article_id` and `article_cat` correctly, but `article_title` and `pub` always come through as null.

**Probable cause:** The article object passed to `trackEvent('article_opened', ...)` is a truncated card-shape (just `{ id, cat }`) rather than the full article (`{ id, title, pub, cat, ... }`). The tracker fires before the full article data is hydrated, OR the article-list components pass a stripped-down article object to the open handler.

**Verification needed:**
- Check `components/articles/ArticleCard.tsx` for what shape it passes to its `onOpen` handler
- Check the `article` object scope at `page.tsx:624` — is it the full record or a card summary?
- Verify in PostHog Live Events: trigger one article open and check the event payload

**Fix:** Either pass the full article record to the tracker, or do a lookup at tracker-fire time to get the full record before calling `trackEvent`.

**Backfill:** Not possible — existing events stay null. New events after the fix will populate. Reports for historical articles will need manual title/pub override (which the override fields handle).

**Workaround in place:** R3b in `/admin/reports` provides title + pub override text inputs so reports work despite null PostHog data.
