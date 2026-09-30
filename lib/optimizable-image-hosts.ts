// Hosts whose images may go through the Next.js image optimizer (resized,
// WebP/AVIF). Must match images.remotePatterns in next.config.ts. Any other
// host keeps rendering as-is (unoptimized) so new builder sites never break.
export const OPTIMIZABLE_IMAGE_HOSTS = [
  'dam.mihomes.com',
  'santaritaranchaustin.com',
  'cdn.pipsy.io',
  'giddenshomes.com',
  'b2lqsyyhvbkewrwf.public.blob.vercel-storage.com',
  'www.kbhome.com',
  'assetcontentdeliveryapi.davidweekleyhomes.com',
  'www.davidweekleyhomes.com',
  'pipsy-naturaldev.s3.us-east-2.amazonaws.com',
  'assetcloud.dreeshomes.com',
  'hollowslaketravis.com',
  'lacimatx.com',
] as const;

/** True when the URL's host is allowlisted for the image optimizer. */
export function canOptimizeImage(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (OPTIMIZABLE_IMAGE_HOSTS as readonly string[]).includes(u.hostname);
  } catch {
    return false;
  }
}
