// caxton-ads-v1
// Reusable Vercel Blob upload widget.
// Steps:
//   1. User picks a file
//   2. Browser uploads directly to Vercel Blob via @vercel/blob/client.upload(),
//      which talks to our /api/admin/ads/upload-token route to mint a signed token
//   3. We measure the image dimensions client-side
//   4. POST blob_url + dimensions + advertiser metadata to droplet
//      /admin/ads/creatives, which records a row
//   5. Hand the new AdCreative back to the parent via onUploaded()
//
// The droplet never sees the file bytes.

'use client';

import { useRef, useState } from 'react';
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

export function CreativeUpload({ advertiserName, clickUrl, altText, onUploaded, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setBusy(true);
    setProgress('Reading file...');

    try {
      // Validate inputs first — better to fail fast than after a Blob upload.
      if (!advertiserName.trim()) throw new Error('Advertiser name is required before uploading');
      if (!clickUrl.trim()) throw new Error('Click URL is required before uploading');
      try {
        new URL(clickUrl);
      } catch {
        throw new Error('Click URL must be a valid URL (include https://)');
      }

      setProgress('Reading image dimensions...');
      const { width, height } = await readImageDimensions(file);

      setProgress('Uploading to Vercel Blob...');
      // Use a path that includes the advertiser slug for browsing convenience.
      const slug = advertiserName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const blob = await upload(`ads/${slug}/${Date.now()}-${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/admin/ads/upload-token',
      });

      setProgress('Recording in database...');
      const result = (await adminApi.recordAdCreative({
        advertiser_name: advertiserName.trim(),
        blob_url: blob.url,
        width,
        height,
        click_url: clickUrl.trim(),
        alt_text: altText.trim() || null,
      })) as { creative: AdCreative };

      setProgress('');
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

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">Choose ad creative image</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handlePick}
          disabled={busy || disabled}
          className="block w-full text-sm text-gray-900
                     file:mr-4 file:py-2 file:px-4 file:rounded-md
                     file:border-0 file:text-sm file:font-medium
                     file:bg-blue-600 file:text-white
                     hover:file:bg-blue-700
                     disabled:opacity-50"
        />
      </label>
      {progress && (
        <p className="text-sm text-blue-700" aria-live="polite">{progress}</p>
      )}
      {error && (
        <p className="text-sm text-red-700" role="alert">{error}</p>
      )}
      <p className="text-xs text-gray-500">
        PNG, JPEG, WebP, or GIF. Max 10MB. Image dimensions are read automatically.
      </p>
    </div>
  );
}
