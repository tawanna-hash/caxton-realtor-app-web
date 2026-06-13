// lib/magazine-gif.ts
//
// Renders animated GIF previews of a magazine from its page-image URLs
// (already stored in Vercel Blob) and uploads the result back to Blob.
// Returns the public URL so the caller can cache it on the magazine row.
//
// Three variants:
//  - 'full'      every page in order, 0.8s per frame
//  - 'teaser'    cover + first 5 pages, 1s per frame
//  - 'pingpong'  cover -> page 2 -> cover, fast loop (smallest file)
//
// Implementation notes:
//  - `sharp` decodes the source JPEGs and resizes to 600px wide for a
//    sane GIF file size (full magazines at 1200+ px would be 10+ MB).
//  - `gifenc` is a pure-JS GIF encoder that works inside Vercel's
//    Node runtime (no native deps beyond sharp itself).
//  - The encoder builds a single shared palette per GIF using
//    `quantize(... 128 colors)` for a tradeoff between fidelity and size.

import sharp from 'sharp';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { put } from '@vercel/blob';

export type GifVariant = 'full' | 'teaser' | 'pingpong';

const GIF_WIDTH = 600;

type VariantSpec = {
  /** Page indices (0-based) to include, in playback order. */
  frameIndices: (pageCount: number) => number[];
  /** Delay between frames, in centiseconds (1cs = 10ms). */
  delayCs: number;
  /** Max color palette size — smaller = smaller file. */
  paletteSize: 64 | 128 | 256;
};

const VARIANTS: Record<GifVariant, VariantSpec> = {
  full: {
    frameIndices: (n) => Array.from({ length: n }, (_, i) => i),
    delayCs: 80,
    paletteSize: 128,
  },
  teaser: {
    frameIndices: (n) => Array.from({ length: Math.min(6, n) }, (_, i) => i),
    delayCs: 100,
    paletteSize: 128,
  },
  pingpong: {
    frameIndices: (n) => (n >= 2 ? [0, 1, 0] : [0]),
    delayCs: 120,
    paletteSize: 64,
  },
};

/**
 * Build the animated GIF and upload it to Vercel Blob.
 * Returns the public URL.
 */
export async function buildMagazineGif(opts: {
  magazineId: number;
  variant: GifVariant;
  pageUrls: string[];
  /** Used in the blob filename; falls back to the id. */
  slug?: string;
}): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not configured');
  }
  if (opts.pageUrls.length === 0) {
    throw new Error('Magazine has no page images to render');
  }

  const spec = VARIANTS[opts.variant];
  const indices = spec.frameIndices(opts.pageUrls.length);

  // 1) Fetch + resize each unique source page once, even if the
  //    variant repeats it (ping-pong reuses the cover twice).
  const uniqueIndices = Array.from(new Set(indices));
  const frameCache = new Map<number, { data: Uint8Array; width: number; height: number }>();
  await Promise.all(
    uniqueIndices.map(async (idx) => {
      const url = opts.pageUrls[idx];
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch page ${idx + 1}: ${res.status}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const { data, info } = await sharp(buf)
        .resize({ width: GIF_WIDTH, withoutEnlargement: true })
        .removeAlpha()
        .ensureAlpha() // gifenc expects RGBA
        .raw()
        .toBuffer({ resolveWithObject: true });
      frameCache.set(idx, {
        data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        width: info.width,
        height: info.height,
      });
    }),
  );

  // 2) Pick canvas size from the first frame; pad/crop later frames
  //    in case page sizes drift (rare but defensive).
  const firstFrame = frameCache.get(indices[0]);
  if (!firstFrame) throw new Error('First frame missing from cache');
  const width = firstFrame.width;
  const height = firstFrame.height;

  // 3) Encode.
  const gif = GIFEncoder();
  for (const idx of indices) {
    const cached = frameCache.get(idx);
    if (!cached) continue;
    const frame = normalizeFrame(cached, width, height);
    // Build a per-frame palette for highest fidelity; the encoder's
    // global palette mode would smear pages with very different
    // color profiles (cover vs. text-heavy interior page).
    const palette = quantize(frame, spec.paletteSize, { format: 'rgba4444' });
    const index = applyPalette(frame, palette, 'rgba4444');
    gif.writeFrame(index, width, height, {
      palette,
      delay: spec.delayCs * 10, // gifenc expects ms
    });
  }
  gif.finish();

  // 4) Upload to Vercel Blob.
  const slugPart = (opts.slug || `magazine-${opts.magazineId}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const filename = `magazine-gifs/${slugPart}-${opts.variant}-${Date.now()}.gif`;
  const blob = await put(filename, Buffer.from(gif.bytes()), {
    access: 'public',
    contentType: 'image/gif',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}

/** Pad or crop an off-size frame so every frame matches the canvas. */
function normalizeFrame(
  frame: { data: Uint8Array; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): Uint8Array {
  if (frame.width === canvasWidth && frame.height === canvasHeight) {
    return frame.data;
  }
  const out = new Uint8Array(canvasWidth * canvasHeight * 4);
  // Fill with white background so smaller frames don't show garbage.
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = 255;
  }
  const copyW = Math.min(frame.width, canvasWidth);
  const copyH = Math.min(frame.height, canvasHeight);
  for (let y = 0; y < copyH; y++) {
    const srcStart = y * frame.width * 4;
    const dstStart = y * canvasWidth * 4;
    out.set(frame.data.subarray(srcStart, srcStart + copyW * 4), dstStart);
  }
  return out;
}
