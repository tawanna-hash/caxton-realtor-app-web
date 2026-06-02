-- Article-reader house-ad seed (June 2026 unification).
--
-- Adds 3 house-ad creatives + campaigns for the article reader slots that
-- used to render inline <HouseAd> JSX in app/(dashboard)/dashboard/page.tsx.
-- Those JSX placeholders are now deleted; the slots render through
-- <AdSlotComponent> backed by these DB rows so PostHog tracks impressions
-- and clicks the same way as every other slot.
--
-- Slugs:
--   article_top_leaderboard  (formerly the inline "leaderboard" HouseAd)
--   article_mid_inline       (formerly the inline "rectangle" HouseAd)
--   article_interstitial     (formerly the inline "popup" HouseAd)
--
-- Mailto destination is ads@myrealtyline.com (the address that was hardcoded
-- in lib/pub-meta.ts and rendered by the old HouseAd component).
--
-- Idempotent: re-running is a no-op (guarded by WHERE NOT EXISTS on
-- advertiser_name + blob_url for creatives, and ad_space_slug + advertiser
-- for campaigns). Also runs automatically via ensureSchema() in lib/db.ts.

BEGIN;

-- ===== Creatives =====
INSERT INTO ad_creatives (advertiser_name, blob_url, width, height, click_url, alt_text, uploaded_by)
SELECT 'RealtyLine House', '/ads/house-article-top-leaderboard.svg', 728, 90,
       'mailto:ads@myrealtyline.com?subject=Article%20Leaderboard%20inquiry',
       'Get featured here — Reach 71,000+ Texas REALTORS',
       'system:house-ad-seed'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_creatives
   WHERE advertiser_name = 'RealtyLine House'
     AND blob_url = '/ads/house-article-top-leaderboard.svg'
);

INSERT INTO ad_creatives (advertiser_name, blob_url, width, height, click_url, alt_text, uploaded_by)
SELECT 'RealtyLine House', '/ads/house-article-mid-inline.svg', 600, 300,
       'mailto:ads@myrealtyline.com?subject=Article%20Mid-Inline%20inquiry',
       'Advertise in RealtyLine — Reach 71,000+ Texas REALTORS',
       'system:house-ad-seed'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_creatives
   WHERE advertiser_name = 'RealtyLine House'
     AND blob_url = '/ads/house-article-mid-inline.svg'
);

INSERT INTO ad_creatives (advertiser_name, blob_url, width, height, click_url, alt_text, uploaded_by)
SELECT 'RealtyLine House', '/ads/house-article-interstitial.svg', 288, 200,
       'mailto:ads@myrealtyline.com?subject=Article%20Interstitial%20inquiry',
       'Advertise in RealtyLine — dismissable popup',
       'system:house-ad-seed'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_creatives
   WHERE advertiser_name = 'RealtyLine House'
     AND blob_url = '/ads/house-article-interstitial.svg'
);

-- ===== Campaigns =====
-- publication='both' (matches austin OR san_antonio). 5-year window.

INSERT INTO ad_campaigns (advertiser_name, ad_space_slug, creative_id, publication,
                          start_date, end_date, active, price_total, price_notes, notes, created_by)
SELECT 'RealtyLine House', 'article_top_leaderboard', c.id, 'both',
       CURRENT_DATE, CURRENT_DATE + INTERVAL '5 years', TRUE,
       NULL, 'house ad — no charge',
       'Auto-seeded house ad. Deactivate when a real advertiser is booked.',
       'system:house-ad-seed'
  FROM ad_creatives c
 WHERE c.advertiser_name = 'RealtyLine House'
   AND c.blob_url = '/ads/house-article-top-leaderboard.svg'
   AND NOT EXISTS (
     SELECT 1 FROM ad_campaigns
      WHERE ad_space_slug = 'article_top_leaderboard'
        AND advertiser_name = 'RealtyLine House'
   );

INSERT INTO ad_campaigns (advertiser_name, ad_space_slug, creative_id, publication,
                          start_date, end_date, active, price_total, price_notes, notes, created_by)
SELECT 'RealtyLine House', 'article_mid_inline', c.id, 'both',
       CURRENT_DATE, CURRENT_DATE + INTERVAL '5 years', TRUE,
       NULL, 'house ad — no charge',
       'Auto-seeded house ad. Deactivate when a real advertiser is booked.',
       'system:house-ad-seed'
  FROM ad_creatives c
 WHERE c.advertiser_name = 'RealtyLine House'
   AND c.blob_url = '/ads/house-article-mid-inline.svg'
   AND NOT EXISTS (
     SELECT 1 FROM ad_campaigns
      WHERE ad_space_slug = 'article_mid_inline'
        AND advertiser_name = 'RealtyLine House'
   );

INSERT INTO ad_campaigns (advertiser_name, ad_space_slug, creative_id, publication,
                          start_date, end_date, active, price_total, price_notes, notes, created_by)
SELECT 'RealtyLine House', 'article_interstitial', c.id, 'both',
       CURRENT_DATE, CURRENT_DATE + INTERVAL '5 years', TRUE,
       NULL, 'house ad — no charge',
       'Auto-seeded house ad. Deactivate when a real advertiser is booked.',
       'system:house-ad-seed'
  FROM ad_creatives c
 WHERE c.advertiser_name = 'RealtyLine House'
   AND c.blob_url = '/ads/house-article-interstitial.svg'
   AND NOT EXISTS (
     SELECT 1 FROM ad_campaigns
      WHERE ad_space_slug = 'article_interstitial'
        AND advertiser_name = 'RealtyLine House'
   );

COMMIT;
