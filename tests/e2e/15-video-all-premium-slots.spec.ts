// tests/e2e/15-video-all-premium-slots.spec.ts
//
// Smoke #15 — every video-ready placement renders and plays a video
// creative on the page where it actually lives. /api/ads/active is mocked
// per slot (page.route) so this is safe to run against production
// (BASE_URL=https://realtynewsnow.app) without booking live campaigns.

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURES = path.join(__dirname, 'fixtures');
const VIDEO = fs.readFileSync(path.join(FIXTURES, 'video-ad.mp4'));
const POSTER = fs.readFileSync(path.join(FIXTURES, 'video-ad-poster.jpg'));
const ARTICLE = process.env.E2E_ARTICLE_PATH ?? '/news/austin-manual-1792812607669-rvh1d7et';

type Case = { slot: string; path: string; w: number; h: number; before?: (p: Page) => Promise<void> };

const CASES: Case[] = [
  { slot: 'featured_builder_strip', path: '/builders', w: 1200, h: 200 },
  { slot: 'giveaway_prize_sponsor', path: '/giveaways', w: 1080, h: 600 },
  { slot: 'calendar_event_sponsor', path: '/calendar', w: 1920, h: 1080 },
  { slot: 'advertisers_directory_top', path: '/advertisers', w: 1920, h: 1080 },
  { slot: 'article_top_leaderboard', path: ARTICLE, w: 300, h: 250 },
  // The sidebar rail lives in the in-feed reader overlay (hidden on /news/:id page mode).
  {
    slot: 'article_sidebar_desktop', path: '/dashboard', w: 300, h: 600,
    before: async (p) => {
      const guest = p.getByText(/continue as a guest/i).first();
      if (await guest.waitFor({ timeout: 8_000 }).then(() => true, () => false)) await guest.click();
      const res = await p.request.get('/api/news/austin');
      const first = ((await res.json()).articles ?? [])[0] ?? {};
      await p.getByText(String(first.head ?? first.title), { exact: false }).first().click();
    },
  },
  { slot: 'article_interstitial', path: ARTICLE, w: 288, h: 200 },
  { slot: 'account_splash', path: '/profile', w: 1080, h: 400 },
  { slot: 'splash_welcome', path: '/builders', w: 1080, h: 1920 },
];

function mockAd(slot: string, w: number, h: number) {
  return {
    id: '00000000-0000-4000-8000-00000000e2e1',
    slot,
    advertiser: 'E2E Video',
    image: '/__e2e/video-ad-poster.jpg',
    media_type: 'video',
    video: '/__e2e/video-ad.mp4',
    duration_seconds: 3,
    width: w,
    height: h,
    href: `https://example.com/e2e-${slot}`,
    alt: `E2E video ${slot}`,
  };
}

async function setup(page: Page, c: Case) {
  await page.addInitScript((isSplash) => {
    try {
      localStorage.setItem('caxton_market_onboarded', '1');
      localStorage.setItem('caxton_pub', 'realtyline');
      // Keep the daily splash out of the way unless it's the slot under test.
      if (isSplash) {
        // Clear the 12h cooldown only on first load, so reload tests the cooldown.
        if (!sessionStorage.getItem('e2e_splash_reset')) {
          localStorage.removeItem('rnn_splash_welcome_last');
          sessionStorage.setItem('e2e_splash_reset', '1');
        }
      }
      else localStorage.setItem('rnn_splash_welcome_last', String(Date.now()));
    } catch { /* ignore */ }
  }, c.slot === 'splash_welcome');
  const ad = mockAd(c.slot, c.w, c.h);
  await page.route('**/api/ads/active?*', async (route) => {
    const url = new URL(route.request().url());
    const multi = url.searchParams.get('multi') === '1';
    if (url.searchParams.get('slot') !== c.slot) return route.fulfill({ json: multi ? { ads: [] } : { ad: null } });
    return route.fulfill({ json: multi ? { ads: [ad] } : { ad } });
  });
  await page.route('**/__e2e/video-ad.mp4', (r) => r.fulfill({ status: 200, contentType: 'video/mp4', body: VIDEO }));
  await page.route('**/__e2e/video-ad-poster.jpg', (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: POSTER }));
  await page.route(/posthog/, (r) => r.fulfill({ status: 200, body: '{}' }));
  return ad;
}

test.describe('video ads — every video-ready slot in place', () => {
  test.use({ serviceWorkers: 'block', viewport: { width: 1366, height: 900 } });

  for (const c of CASES) {
    test(`${c.slot} plays on ${c.path}`, async ({ page }) => {
      const ad = await setup(page, c);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const res = await page.goto(c.path);
      expect(res?.status(), 'page status').toBeLessThan(400);
      if (c.before) await c.before(page);

      const video = page.locator(`video[aria-label="${ad.alt}"]`);
      await expect(video).toBeAttached({ timeout: 20_000 });
      await video.scrollIntoViewIfNeeded();
      await expect(video).toBeVisible();
      await expect(video).toHaveAttribute('src', ad.video);
      await expect(video).toHaveAttribute('poster', ad.image);
      await expect(video).toHaveAttribute('playsinline', '');
      expect(await video.evaluate((v: HTMLVideoElement) => v.muted && v.autoplay)).toBe(true);
      await expect(page.locator(`a[href="${ad.href}"]`).filter({ has: video })).toHaveCount(1);

      const box = await video.boundingBox();
      expect(box && box.width > 50 && box.height > 20, `size ${JSON.stringify(box)}`).toBeTruthy();

      const canPlay = await video.evaluate((v: HTMLVideoElement) => v.canPlayType('video/mp4; codecs="avc1.42E01E"'));
      test.info().annotations.push({ type: 'h264', description: canPlay || 'unsupported' });
      if (canPlay) {
        await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10_000 }).toBeGreaterThan(0);
      }

      if (c.slot === 'splash_welcome') {
        const skip = page.getByRole('button', { name: /^skip/i });
        await expect(skip).toBeDisabled();
        await expect(skip).toBeEnabled({ timeout: 6_000 });
        await skip.click();
        await expect(page.getByRole('dialog', { name: /sponsored welcome/i })).toHaveCount(0);
        // Cooldown: reload should not show it again.
        await page.reload();
        await page.waitForTimeout(2500);
        await expect(page.getByRole('dialog', { name: /sponsored welcome/i })).toHaveCount(0);
      }

      await page.screenshot({ path: test.info().outputPath(`${c.slot}.png`) });
      expect(errors, 'uncaught page errors').toEqual([]);
    });
  }
});
