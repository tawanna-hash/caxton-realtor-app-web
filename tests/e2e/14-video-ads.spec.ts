// tests/e2e/14-video-ads.spec.ts
//
// Smoke #14 — video ad creatives.
//   - Public docs: /advertise/video-specs, placements badges, Media Kit section.
//   - Live API shape: /api/ads/active returns media_type (and video/poster
//     URLs when the creative is a video) without erroring.
//   - Playback: AdSlot renders a muted, inline, autoplaying <video> with a
//     poster when the API returns a video creative (mocked via page.route
//     so the test doesn't depend on a live booked campaign).
//   - Reduced motion: falls back to the poster still, no <video>.
//   - Security: the admin upload-token route refuses unauthenticated video
//     token requests; /c/:id for an unknown id is a 404, not a 500.

import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURES = path.join(__dirname, 'fixtures');
const VIDEO = fs.readFileSync(path.join(FIXTURES, 'video-ad.mp4'));
const POSTER = fs.readFileSync(path.join(FIXTURES, 'video-ad-poster.jpg'));

const MOCK_AD = {
  id: '00000000-0000-4000-8000-00000000e2e1',
  slot: 'featured_builder_strip',
  advertiser: 'E2E Builder',
  image: '/__e2e/video-ad-poster.jpg',
  media_type: 'video',
  video: '/__e2e/video-ad.mp4',
  duration_seconds: 3,
  width: 1200,
  height: 200,
  href: 'https://example.com/e2e-video-ad',
  alt: 'E2E video ad',
};

async function skipMarketPicker(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('caxton_market_onboarded', '1');
      localStorage.setItem('caxton_pub', 'realtyline');
    } catch {
      /* ignore */
    }
  });
}

async function mockVideoAd(page: Page) {
  await page.route('**/api/ads/active?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('slot') !== 'featured_builder_strip') return route.continue();
    if (url.searchParams.get('multi') === '1') return route.fulfill({ json: { ads: [MOCK_AD] } });
    return route.fulfill({ json: { ad: MOCK_AD } });
  });
  await page.route('**/__e2e/video-ad.mp4', (route) =>
    route.fulfill({ status: 200, contentType: 'video/mp4', body: VIDEO }),
  );
  await page.route('**/__e2e/video-ad-poster.jpg', (route) =>
    route.fulfill({ status: 200, contentType: 'image/jpeg', body: POSTER }),
  );
  // Don't let analytics calls slow the page down.
  await page.route(/posthog|i\.posthog\.com/, (route) => route.fulfill({ status: 200, body: '{}' }));
}

test.describe('video ads — public docs', () => {
  test('/advertise/video-specs lists placements, file specs, and the e-Blast option', async ({ page }) => {
    await skipMarketPicker(page);
    const res = await page.goto('/advertise/video-specs');
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole('heading', { name: /video ad specifications/i })).toBeVisible();
    for (const name of ['Featured Builder Strip', 'Giveaway Prize Sponsor', 'Calendar Event Sponsor', 'Advertiser Directory Spotlight']) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText('MP4 (preferred) or MOV')).toBeVisible();
    await expect(page.getByText(/100 MB max/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /e-Blast video option/i })).toBeVisible();
    await expect(page.getByText(/600×300 px/)).toBeVisible();
  });

  test('/advertise/placements shows Video badges and links to the specs', async ({ page }) => {
    await skipMarketPicker(page);
    await page.goto('/advertise/placements');
    // 8 video-ready rate-card slots + the intro legend badge.
    await expect(page.locator('span', { hasText: /^Video$/ })).toHaveCount(9);
    await expect(page.locator('span', { hasText: /^Video via GIF$/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /video ad specs/i })).toHaveAttribute('href', '/advertise/video-specs');
  });

  test('Media Kit has a Video Ads section', async ({ page }) => {
    await skipMarketPicker(page);
    await page.goto('/advertise');
    await expect(page.getByRole('heading', { name: 'Video Ads' })).toBeVisible();
    await expect(page.getByRole('link', { name: /full video specs/i })).toHaveAttribute('href', '/advertise/video-specs');
  });
});

test.describe('video ads — API + routes', () => {
  test('/api/ads/active returns a media_type for every live creative', async ({ request }) => {
    test.skip(process.env.E2E_NO_DB === '1', 'needs a database');
    for (const pub of ['realtyline', 'newsline']) {
      for (const slot of ['featured_builder_strip', 'giveaway_prize_sponsor', 'calendar_event_sponsor', 'advertisers_directory_top']) {
        const res = await request.get(`/api/ads/active?slot=${slot}&pub=${pub}`);
        expect(res.status(), `${slot}/${pub}`).toBe(200);
        const body = (await res.json()) as { ad: null | Record<string, unknown> };
        if (!body.ad) continue;
        expect(['image', 'video']).toContain(body.ad.media_type);
        if (body.ad.media_type === 'video') {
          expect(body.ad.video).toBe(`/c/${body.ad.id}`);
          expect(body.ad.image).toBe(`/c/${body.ad.id}?poster=1`);
        } else {
          expect(body.ad.video).toBeNull();
        }
      }
    }
  });

  test('upload-token refuses unauthenticated video uploads', async ({ request }) => {
    const res = await request.post('/api/admin/ads/upload-token', {
      data: {
        type: 'blob.generate-client-token',
        payload: { pathname: 'media/e2e/test.mp4', clientPayload: JSON.stringify({ kind: 'video' }), multipart: false },
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('/c/:id for an unknown creative is a 404', async ({ request }) => {
    test.skip(process.env.E2E_NO_DB === '1', 'needs a database');
    const res = await request.get('/c/00000000-0000-4000-8000-000000000000', { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    const poster = await request.get('/c/00000000-0000-4000-8000-000000000000?poster=1', { maxRedirects: 0 });
    expect(poster.status()).toBe(404);
  });
});

test.describe('video ads — AdSlot playback', () => {
  // The PWA service worker would answer /api/ads/active itself and bypass
  // page.route mocks in Chromium.
  test.use({ serviceWorkers: 'block' });
  // /builders renders from the database.
  test.skip(process.env.E2E_NO_DB === '1', 'needs a database');
  test('renders a muted, inline, autoplaying video with poster and click-through', async ({ page }) => {
    await skipMarketPicker(page);
    await mockVideoAd(page);
    await page.goto('/builders');

    const video = page.locator('video[aria-label="E2E video ad"]');
    await expect(video).toBeVisible({ timeout: 15_000 });
    await expect(video).toHaveAttribute('poster', MOCK_AD.image);
    await expect(video).toHaveAttribute('src', MOCK_AD.video);
    await expect(video).toHaveAttribute('playsinline', '');
    expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
    expect(await video.evaluate((v: HTMLVideoElement) => v.autoplay)).toBe(true);
    // Single creative in a non-rotating slot → loops.
    expect(await video.evaluate((v: HTMLVideoElement) => v.loop)).toBe(true);

    // Wrapped in the sponsored click-through link.
    const link = page.locator(`a[href="${MOCK_AD.href}"]`).filter({ has: video });
    await expect(link).toHaveCount(1);

    // Actually plays where the engine has an H.264 decoder (open-source
    // Chromium builds don't ship one; WebKit / Chrome do).
    const canPlay = await video.evaluate((v: HTMLVideoElement) => v.canPlayType('video/mp4; codecs="avc1.42E01E"'));
    test.info().annotations.push({ type: 'h264', description: canPlay || 'unsupported' });
    if (canPlay) {
      await video.scrollIntoViewIfNeeded();
      await expect
        .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10_000 })
        .toBeGreaterThan(0);
    }
  });

  test('prefers-reduced-motion shows the poster still instead of video', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await skipMarketPicker(page);
    await mockVideoAd(page);
    await page.goto('/builders');
    await expect(page.locator(`a[href="${MOCK_AD.href}"] img`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('video[aria-label="E2E video ad"]')).toHaveCount(0);
  });
});
