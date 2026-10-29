// caxton-ads-v1
// Reusable Vercel Blob upload widget.
// Steps:
//   1. User picks a file
//   2. Browser uploads directly to Vercel Blob via @vercel/blob/client.upload(),
//      which talks to our /api/admin/ads/upload-token route to mint a signed token
//   3. We measure the image dimensions client-side (video: dimensions +
//      duration, and we capture a still poster frame that is uploaded too)
//   4. POST blob_url + dimensions + advertiser metadata to droplet
//      /admin/ads/creatives, which records a row
//   5. Hand the new AdCreative back to the parent via onUploaded()
//
// The droplet never sees the file bytes.

'use client';

import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { adminApi } from '@/lib/admin-api';
import type { AdCreative } from './types';

interface Props {
  advertiserName: string;
  clickUrl: string;
  altText: string;
  onUploaded: (creative: AdCreative) => void;
  disabled?: boolean;
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image dimensions'));
    };
    img.src = url;
  });
}

// Video creative limits (kept in sync with docs/VIDEO_AD_SPECS.md and the
// upload-token route).
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const VIDEO_MAX_SECONDS = 60;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function isVideoFile(file: File): boolean {
  return VIDEO_TYPES.includes(file.type) || /\.(mp4|mov|m4v)$/i.test(file.name);
}

/**
 * Loads a local video file, returns its intrinsic size + duration, and a
 * JPEG poster captured ~1s in (or mid-point for very short clips).
 */
async function readVideoMeta(
  file: File,
): Promise<{ width: number; height: number; duration: number; poster: Blob }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () =>
        reject(new Error('Could not read this video. Export as MP4 (H.264 + AAC) and try again.'));
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    const duration = video.duration;
    if (!width || !height || !Number.isFinite(duration)) {
      throw new Error('Could not read video dimensions or length. Export as MP4 (H.264) and try again.');
    }
    const at = Math.min(1, duration / 2);
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error('Could not capture a poster frame from this video.'));
      video.currentTime = at;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not capture a poster frame from this video.');
    ctx.drawImage(video, 0, 0, width, height);
    const poster = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not capture a poster frame from this video.'))),
        'image/jpeg',
        0.85,
      ),
    );
    return { width, height, duration, poster };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

export function CreativeUpload({ advertiserName, clickUrl, altText, onUploaded, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  // A file picked before the partner name / click URL are filled in is held
  // here and uploaded automatically as soon as both are valid, so the user
  // does not have to re-pick it.
  const pendingRef = useRef<File | null>(null);

  function inputsReady(): string | null {
    if (!advertiserName.trim()) return 'Partner name is required before uploading';
    if (!clickUrl.trim()) return 'Click URL is required before uploading';
    try {
      new URL(clickUrl.trim());
    } catch {
      return 'Click URL must be a valid URL (include https://)';
    }
    return null;
  }


  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const problem = inputsReady();
    if (problem) {
      pendingRef.current = file;
      setError(`${problem}. Your file is saved and will upload as soon as it is filled in.`);
      return;
    }
    void uploadFile(file);
  }

  async function uploadFile(file: File) {
    setError(null);
    setBusy(true);
    setProgress('Reading file...');

    try {
      const problem = inputsReady();
      if (problem) throw new Error(problem);

      const slug = advertiserName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'partner';
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
      let record: Parameters<typeof adminApi.recordAdCreative>[0];

      if (isVideoFile(file)) {
        if (file.size > VIDEO_MAX_BYTES) {
          throw new Error(`Video is ${(file.size / 1048576).toFixed(0)}MB. Max is 100MB — re-export at a lower bitrate.`);
        }
        setProgress('Reading video size and length...');
        const meta = await readVideoMeta(file);
        if (meta.duration > VIDEO_MAX_SECONDS + 0.5) {
          throw new Error(`Video is ${Math.round(meta.duration)}s long. Max is ${VIDEO_MAX_SECONDS}s for on-site video ads.`);
        }
        // Neutral `media/` prefix: the public /c/:id URL redirects here for
        // playback, so the path must not contain `/ads/` (ad-blocker filters).
        const base = `media/${slug}/${Date.now()}`;
        setProgress('Uploading poster frame...');
        const posterBlob = await upload(`${base}-poster.jpg`, meta.poster, {
          access: 'public',
          handleUploadUrl: '/api/admin/ads/upload-token',
          contentType: 'image/jpeg',
        });
        setProgress('Uploading video (0%)...');
        const videoBlob = await upload(`${base}-${safeName}`, file, {
          access: 'public',
          handleUploadUrl: '/api/admin/ads/upload-token',
          clientPayload: JSON.stringify({ kind: 'video' }),
          multipart: file.size > 20 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => setProgress(`Uploading video (${Math.round(percentage)}%)...`),
        });
        record = {
          advertiser_name: advertiserName.trim(),
          blob_url: videoBlob.url,
          width: meta.width,
          height: meta.height,
          click_url: clickUrl.trim(),
          alt_text: altText.trim() || null,
          media_type: 'video',
          poster_url: posterBlob.url,
          duration_seconds: Math.round(meta.duration * 100) / 100,
        };
      } else {
        if (!IMAGE_TYPES.includes(file.type)) {
          throw new Error('Unsupported file. Use PNG, JPEG, WebP, GIF, or an MP4/MOV video.');
        }
        if (file.size > IMAGE_MAX_BYTES) throw new Error('Image is over 10MB.');
        setProgress('Reading image dimensions...');
        const { width, height } = await readImageDimensions(file);

        setProgress('Uploading to Vercel Blob...');
        // Use a path that includes the advertiser slug for browsing convenience.
        const blob = await upload(`ads/${slug}/${Date.now()}-${file.name}`, file, {
          access: 'public',
          handleUploadUrl: '/api/admin/ads/upload-token',
        });
        record = {
          advertiser_name: advertiserName.trim(),
          blob_url: blob.url,
          width,
          height,
          click_url: clickUrl.trim(),
          alt_text: altText.trim() || null,
          media_type: 'image',
        };
      }

      setProgress('Recording in database...');
      const result = (await adminApi.recordAdCreative(record)) as { creative: AdCreative };

      setProgress('');
      pendingRef.current = null;
      onUploaded(result.creative);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const f = pendingRef.current;
    if (f && !busy && inputsReady() === null) {
      pendingRef.current = null;
      void uploadFile(f);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advertiserName, clickUrl]);

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">Choose ad creative image or video</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,.mp4,.mov"
          onChange={handlePick}
          disabled={busy || disabled}
          className="block w-full text-sm text-gray-900
                     file:mr-4 file:h-9 file:px-4 file:rounded
                     file:border file:border-[#42277C] file:text-sm file:font-semibold
                     file:bg-[#301D5D] file:text-white
                     hover:file:bg-[#42277C]
                     disabled:opacity-50"
        />
      </label>
      {progress && (
        <p className="text-sm text-[#42277C]" aria-live="polite">{progress}</p>
      )}
      {error && (
        <p className="text-sm text-[#661102]" role="alert">{error}</p>
      )}
      <p className="text-xs text-gray-500">
        Images: PNG, JPEG, WebP, or GIF up to 10MB. Video: MP4 or MOV (H.264), up to 60s and 100MB,
        plays muted on web and app placements only (not email). Size, length, and a poster frame are read automatically.
      </p>
    </div>
  );
}
