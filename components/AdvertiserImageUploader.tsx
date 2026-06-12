'use client';

// components/AdvertiserImageUploader.tsx
//
// Compact image uploader used in the admin CRM modal (company logo) and
// the LocationsStaffEditor (per-staff headshot). Renders a thumbnail of
// the current image (or a placeholder), an Upload button, a URL input
// for direct pasting, and a Remove button.

import { useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (url: string) => void;
  /** What's being uploaded — sent as the `kind` form field to the route. */
  kind: 'logo' | 'staff_photo';
  /** Visible label on empty placeholder, e.g. "logo" or "photo". */
  emptyLabel?: string;
  onError?: (msg: string) => void;
  /** Visible "Square" or "Circle" preview shape. Defaults to square. */
  shape?: 'square' | 'circle';
}

export default function AdvertiserImageUploader({
  value,
  onChange,
  kind,
  emptyLabel = 'image',
  onError,
  shape = 'square',
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handlePick = () => {
    if (uploading) return;
    inputRef.current?.click();
  };

  const handleFile = async (file: File) => {
    if (uploading) return;
    if (!file.type.startsWith('image/')) {
      onError?.(`Unsupported file type: ${file.type || file.name}`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch('/api/admin/advertisers/upload-image', {
        method: 'POST',
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError?.(`Upload failed: ${j?.detail || j?.error || `HTTP ${res.status}`}`);
        return;
      }
      if (typeof j?.url === 'string') {
        onChange(j.url);
      }
    } catch (err) {
      onError?.(
        `Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    } finally {
      setUploading(false);
    }
  };

  const rounded = shape === 'circle' ? 'rounded-full' : 'rounded-md';

  return (
    <div className="flex items-start gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          // Reset so the same file can be re-picked.
          e.target.value = '';
        }}
      />
      <div
        className={`relative w-20 h-20 flex-shrink-0 border border-gray-300 bg-gray-50 overflow-hidden ${rounded}`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={emptyLabel}
            className="w-full h-full object-cover"
            onError={() => {
              // Don't unset; admin may still want to edit the URL.
              // Show a fallback border highlight instead.
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-[0.1em] text-gray-400">
            No {emptyLabel}
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-[10px] text-gray-700">
            Uploading…
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={handlePick}
            disabled={uploading}
            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
              uploading
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait'
                : 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
            }`}
          >
            {uploading ? 'Uploading…' : value ? 'Replace' : 'Upload'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={uploading}
              className="px-2.5 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Remove
            </button>
          )}
        </div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="…or paste an image URL (https://)"
          className="w-full text-xs border border-gray-300 rounded px-2 py-1 placeholder:text-gray-400"
        />
      </div>
    </div>
  );
}
