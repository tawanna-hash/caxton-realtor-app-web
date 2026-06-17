#!/usr/bin/env node
/**
 * Generate the full iOS App Icon set from a single 1024x1024 source.
 *
 * Output goes to resources/ios/icons/ as flat PNGs. After `npx cap add ios`
 * runs, we copy these into ios/App/App/Assets.xcassets/AppIcon.appiconset/
 * via the Contents.json manifest Capacitor scaffolds.
 *
 * iOS does NOT want pre-rounded corners or transparency on the 1024 marketing
 * icon. All sizes are flat squares.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'resources/icon.png');
const OUT_DIR = join(ROOT, 'resources/ios/icons');

mkdirSync(OUT_DIR, { recursive: true });

// iOS App Icon size manifest (pt @ scale = px). Source: Apple HIG.
const sizes = [
  // iPhone notification
  { name: 'AppIcon-20@2x.png', px: 40 },
  { name: 'AppIcon-20@3x.png', px: 60 },
  // iPhone settings
  { name: 'AppIcon-29@2x.png', px: 58 },
  { name: 'AppIcon-29@3x.png', px: 87 },
  // iPhone spotlight
  { name: 'AppIcon-40@2x.png', px: 80 },
  { name: 'AppIcon-40@3x.png', px: 120 },
  // iPhone app
  { name: 'AppIcon-60@2x.png', px: 120 },
  { name: 'AppIcon-60@3x.png', px: 180 },
  // iPad notification
  { name: 'AppIcon-20.png', px: 20 },
  { name: 'AppIcon-20@2x-ipad.png', px: 40 },
  // iPad settings
  { name: 'AppIcon-29.png', px: 29 },
  { name: 'AppIcon-29@2x-ipad.png', px: 58 },
  // iPad spotlight
  { name: 'AppIcon-40.png', px: 40 },
  { name: 'AppIcon-40@2x-ipad.png', px: 80 },
  // iPad app
  { name: 'AppIcon-76.png', px: 76 },
  { name: 'AppIcon-76@2x.png', px: 152 },
  // iPad Pro app
  { name: 'AppIcon-83.5@2x.png', px: 167 },
  // App Store marketing
  { name: 'AppIcon-1024.png', px: 1024 },
];

const src = sharp(SOURCE).removeAlpha().flatten({ background: '#0a3d91' });

const results = [];
for (const { name, px } of sizes) {
  const outPath = join(OUT_DIR, name);
  await src
    .clone()
    .resize(px, px, { fit: 'cover', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  results.push(`  ${px.toString().padStart(4, ' ')}px  ${name}`);
}

console.log(`Generated ${sizes.length} iOS icon assets in ${OUT_DIR}:`);
console.log(results.join('\n'));
