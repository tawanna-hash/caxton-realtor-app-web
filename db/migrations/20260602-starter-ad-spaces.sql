-- 20260602-starter-ad-spaces.sql
-- Seeds the two new ad_spaces rows needed to complete the 5-slot starter
-- pack from MONETIZATION_MAP.md. The other three starter slugs
-- (calendar_event_sponsor, feed_sticky_bottom, newsletter_banner) were
-- already present from the May 9 2026 ads-dashboard seed in lib/db.ts.
--
-- Idempotent (ON CONFLICT DO NOTHING). Also runs automatically via
-- ensureSchema() at boot — this file is the explicit migration-history
-- companion so Neon's migration log shows when these slots landed.

INSERT INTO ad_spaces (slug, display_name, zone, tier, sizes_json, notes)
VALUES
  (
    'featured_builder_strip',
    'Featured Builder Strip',
    'feed',
    'premium',
    '[{"w":0,"h":0,"context":"native-strip"},{"w":1200,"h":200,"context":"desktop-hero"},{"w":600,"h":160,"context":"mobile-hero"}]'::jsonb,
    'Above the filter chips on /inventory and /builders. Logo + tagline + CTA. Premium tier; sell weekly.'
  ),
  (
    'giveaway_prize_sponsor',
    'Giveaway Prize Sponsor',
    'feed',
    'premium',
    '[{"w":0,"h":0,"context":"native-card"},{"w":1080,"h":600,"context":"feed-card"}]'::jsonb,
    '"Prize provided by..." on /giveaways cards + entry-confirmation page. Sponsor pays for prize + visibility.'
  )
ON CONFLICT (slug) DO NOTHING;
