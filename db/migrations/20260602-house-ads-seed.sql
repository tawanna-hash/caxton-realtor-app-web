-- House-ad placeholder creatives + campaigns for the 5 starter slots.
-- Renders a "Feature your brand here" placeholder until a real advertiser fills the slot.
-- Idempotent: re-running is a no-op (guarded by WHERE NOT EXISTS on advertiser_name + click_url).
--
-- Strategy:
--   1. Insert 5 creatives owned by "RealtyLine House" pointing at /ads/*.svg
--   2. Insert 5 campaigns (publication='both', long date range) referencing those creatives
--
-- To remove a house ad once a real advertiser is booked: in /admin/ads, deactivate the
-- house campaign for that slug (set active=false). The real advertiser's campaign will
-- take over automatically (or use date-range overlap with random tiebreaker).

BEGIN;

-- ===== Creatives =====
INSERT INTO ad_creatives (advertiser_name, blob_url, width, height, click_url, alt_text, uploaded_by)
SELECT 'RealtyLine House', '/ads/house-featured-builder-strip.svg', 728, 90,
       'mailto:ads@realtynewsnow.app?subject=Featured%20Builder%20Strip%20inquiry',
       'Feature your model homes here — advertise with RealtyLine',
       'system:house-ad-seed'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_creatives
   WHERE advertiser_name = 'RealtyLine House'
     AND blob_url = '/ads/house-featured-builder-strip.svg'
);

INSERT INTO ad_creatives (advertiser_name, blob_url, width, height, click_url, alt_text, uploaded_by)
SELECT 'RealtyLine House', '/ads/house-calendar-event-sponsor.svg', 600, 160,
       'mailto:ads@realtynewsnow.app?subject=Calendar%20Event%20Sponsor%20inquiry',
       'Sponsor a pinned calendar event',
       'system:house-ad-seed'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_creatives
   WHERE advertiser_name = 'RealtyLine House'
     AND blob_url = '/ads/house-calendar-event-sponsor.svg'
);

INSERT INTO ad_creatives (advertiser_name, blob_url, width, height, click_url, alt_text, uploaded_by)
SELECT 'RealtyLine House', '/ads/house-feed-sticky-bottom.svg', 320, 50,
       'mailto:ads@realtynewsnow.app?subject=Sticky%20Bottom%20Banner%20inquiry',
       'Your ad here — sticky bottom banner',
       'system:house-ad-seed'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_creatives
   WHERE advertiser_name = 'RealtyLine House'
     AND blob_url = '/ads/house-feed-sticky-bottom.svg'
);

INSERT INTO ad_creatives (advertiser_name, blob_url, width, height, click_url, alt_text, uploaded_by)
SELECT 'RealtyLine House', '/ads/house-giveaway-prize-sponsor.svg', 600, 200,
       'mailto:ads@realtynewsnow.app?subject=Giveaway%20Prize%20Sponsor%20inquiry',
       'Become a giveaway prize sponsor',
       'system:house-ad-seed'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_creatives
   WHERE advertiser_name = 'RealtyLine House'
     AND blob_url = '/ads/house-giveaway-prize-sponsor.svg'
);

INSERT INTO ad_creatives (advertiser_name, blob_url, width, height, click_url, alt_text, uploaded_by)
SELECT 'RealtyLine House', '/ads/house-newsletter-banner.svg', 600, 200,
       'mailto:ads@realtynewsnow.app?subject=Newsletter%20Sponsor%20inquiry',
       'Top-of-newsletter sponsorship',
       'system:house-ad-seed'
WHERE NOT EXISTS (
  SELECT 1 FROM ad_creatives
   WHERE advertiser_name = 'RealtyLine House'
     AND blob_url = '/ads/house-newsletter-banner.svg'
);

-- ===== Campaigns =====
-- publication='both' is supported in lib/server/ads-store.ts (matches either austin or san_antonio).
-- Long date window (5 years) so house ads keep rendering until manually deactivated.

INSERT INTO ad_campaigns (advertiser_name, ad_space_slug, creative_id, publication,
                          start_date, end_date, active, price_total, price_notes, notes, created_by)
SELECT 'RealtyLine House', 'featured_builder_strip', c.id, 'both',
       CURRENT_DATE, CURRENT_DATE + INTERVAL '5 years', TRUE,
       NULL, 'house ad — no charge',
       'Auto-seeded house ad. Deactivate when a real advertiser is booked.',
       'system:house-ad-seed'
  FROM ad_creatives c
 WHERE c.advertiser_name = 'RealtyLine House'
   AND c.blob_url = '/ads/house-featured-builder-strip.svg'
   AND NOT EXISTS (
     SELECT 1 FROM ad_campaigns
      WHERE ad_space_slug = 'featured_builder_strip'
        AND advertiser_name = 'RealtyLine House'
   );

INSERT INTO ad_campaigns (advertiser_name, ad_space_slug, creative_id, publication,
                          start_date, end_date, active, price_total, price_notes, notes, created_by)
SELECT 'RealtyLine House', 'calendar_event_sponsor', c.id, 'both',
       CURRENT_DATE, CURRENT_DATE + INTERVAL '5 years', TRUE,
       NULL, 'house ad — no charge',
       'Auto-seeded house ad. Deactivate when a real advertiser is booked.',
       'system:house-ad-seed'
  FROM ad_creatives c
 WHERE c.advertiser_name = 'RealtyLine House'
   AND c.blob_url = '/ads/house-calendar-event-sponsor.svg'
   AND NOT EXISTS (
     SELECT 1 FROM ad_campaigns
      WHERE ad_space_slug = 'calendar_event_sponsor'
        AND advertiser_name = 'RealtyLine House'
   );

INSERT INTO ad_campaigns (advertiser_name, ad_space_slug, creative_id, publication,
                          start_date, end_date, active, price_total, price_notes, notes, created_by)
SELECT 'RealtyLine House', 'feed_sticky_bottom', c.id, 'both',
       CURRENT_DATE, CURRENT_DATE + INTERVAL '5 years', TRUE,
       NULL, 'house ad — no charge',
       'Auto-seeded house ad. Deactivate when a real advertiser is booked.',
       'system:house-ad-seed'
  FROM ad_creatives c
 WHERE c.advertiser_name = 'RealtyLine House'
   AND c.blob_url = '/ads/house-feed-sticky-bottom.svg'
   AND NOT EXISTS (
     SELECT 1 FROM ad_campaigns
      WHERE ad_space_slug = 'feed_sticky_bottom'
        AND advertiser_name = 'RealtyLine House'
   );

INSERT INTO ad_campaigns (advertiser_name, ad_space_slug, creative_id, publication,
                          start_date, end_date, active, price_total, price_notes, notes, created_by)
SELECT 'RealtyLine House', 'giveaway_prize_sponsor', c.id, 'both',
       CURRENT_DATE, CURRENT_DATE + INTERVAL '5 years', TRUE,
       NULL, 'house ad — no charge',
       'Auto-seeded house ad. Deactivate when a real advertiser is booked.',
       'system:house-ad-seed'
  FROM ad_creatives c
 WHERE c.advertiser_name = 'RealtyLine House'
   AND c.blob_url = '/ads/house-giveaway-prize-sponsor.svg'
   AND NOT EXISTS (
     SELECT 1 FROM ad_campaigns
      WHERE ad_space_slug = 'giveaway_prize_sponsor'
        AND advertiser_name = 'RealtyLine House'
   );

INSERT INTO ad_campaigns (advertiser_name, ad_space_slug, creative_id, publication,
                          start_date, end_date, active, price_total, price_notes, notes, created_by)
SELECT 'RealtyLine House', 'newsletter_banner', c.id, 'both',
       CURRENT_DATE, CURRENT_DATE + INTERVAL '5 years', TRUE,
       NULL, 'house ad — no charge',
       'Auto-seeded house ad. Deactivate when a real advertiser is booked.',
       'system:house-ad-seed'
  FROM ad_creatives c
 WHERE c.advertiser_name = 'RealtyLine House'
   AND c.blob_url = '/ads/house-newsletter-banner.svg'
   AND NOT EXISTS (
     SELECT 1 FROM ad_campaigns
      WHERE ad_space_slug = 'newsletter_banner'
        AND advertiser_name = 'RealtyLine House'
   );

COMMIT;
