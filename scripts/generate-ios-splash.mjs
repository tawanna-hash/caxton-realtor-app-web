#!/usr/bin/env node
/**
 * Generate iOS splash/launch screen images.
 *
 * Strategy: centered icon (~30% of shortest edge) on a solid navy background
 * matching the app's brand color (#0a3d91). Apple now prefers a Launch Storyboard,
 * but legacy splash PNGs still work via Capacitor's SplashScreen plugin.
 *
 * We generate the largest universal sizes; Capacitor's `cap copy` resizes if needed.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE_ICON = join(ROOT, 'resources/icon.png');
const OUT_DIR = join(ROOT, 'resources/ios/splash');

mkdirSync(OUT_DIR, { recursive: true });

const BG = { r: 10, g: 61, b: 145, alpha: 1 }; // #0a3d91

const sizes = [
  { name: 'splash-2732x2732.png', w: 2732, h: 2732 }, // universal @1x
  { name: 'splash-2732x2732-1.png', w: 2732, h: 2732 }, // universal @2x
  { name: 'splash-2732x2732-2.png', w: 2732, h: 2732 }, // universal @3x
];

for (const { name, w, h } of sizes) {
  const iconPx = Math.round(Math.min(w, h) * 0.28);
  const iconBuf = await sharp(SOURCE_ICON)
    .resize(iconPx, iconPx, { fit: 'cover', kernel: 'lanczos3' })
    .png()
    .toBuffer();

  await sharp({
    create: { width: w, height: h, channels: 4, background: BG },
  })
    .composite([{ input: iconBuf, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(join(OUT_DIR, name));

  console.log(`  ${w}x${h}  ${name}`);
}

console.log(`\nGenerated ${sizes.length} splash assets in ${OUT_DIR}`);
