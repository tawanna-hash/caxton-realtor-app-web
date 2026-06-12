'use client';

// components/AdvertiserImageUploader.tsx
//
// Compact image uploader used in the admin CRM modal (company logo) and
// the LocationsStaffEditor (per-staff headshot). Renders a thumbnail of
// the current image (or a placeholder), an Upload button, a URL input
// for direct pasting, and a Remove button.
//
// PDF logos: client-side, we render page 1 to a <canvas> via pdfjs-dist
// and upload the resulting PNG as the avatar. This makes the logo show
// up in browsers (PDFs would otherwise fall back to the monogram on the
// public page).
//
// AI/EPS/PSD logos: stored as the source file (designers can download)
// but the browser still can't render them - the public page will fall
// back to the monogram.

import { useRef, useState } from 'react';

const PREVIEWABLE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'ico', 'bmp']);

function fileExtFromUrl(url: string): string {
  try {
    // Strip query and hash, take last path segment, take after final dot.
    const path = url.split('?')[0].split('#')[0];
    const m = /\.([a-z0-9]{2,5})$/i.exec(path);
    return m ? m[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

function isPreviewableImage(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  const ext = fileExtFromUrl(url);
  if (ext) return PREVIEWABLE_EXTS.has(ext);
  // No detectable extension (e.g. signed URL without extension) — assume it's
  // an image and let the <img> tag try.
  return true;
}

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

  // Render page 1 of a PDF to a PNG Blob using pdfjs-dist. Returns null if
  // anything goes wrong - the caller falls back to uploading the PDF
  // verbatim, which still preserves the source file (just won't render).
  async function rasterizePdfFirstPage(file: File): Promise<File | null> {
    try {
      const pdfjs = await import('pdfjs-dist');
      // Tell pdfjs where to find its worker. We use the unpkg CDN copy
      // pinned to the same version we ship with so it stays in sync.
      const workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

      const arrayBuf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
      const page = await pdf.getPage(1);
      // Aim for ~512px on the longest side - plenty for the 112px header
      // slot but still crisp on retina displays.
      const baseViewport = page.getViewport({ scale: 1 });
      const longestSide = Math.max(baseViewport.width, baseViewport.height);
      const scale = Math.min(4, Math.max(1, 512 / longestSide));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // White background so transparent PDFs don't blend into whatever's
      // behind them.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 0.95),
      );
      if (!blob) return null;
      const safeName = file.name.replace(/\.pdf$/i, '') || 'logo';
      return new File([blob], `${safeName}.png`, { type: 'image/png' });
    } catch (err) {
      console.warn('[AdvertiserImageUploader] PDF rasterization failed', err);
      return null;
    }
  }

  const handleFile = async (file: File) => {
    if (uploading) return;
    // For logos we accept image/* plus vector source files (.pdf/.ai/.eps/.psd).
    // Staff photos stay image-only.
    if (kind === 'staff_photo' && !file.type.startsWith('image/')) {
      onError?.(`Unsupported file type: ${file.type || file.name}`);
      return;
    }

    // PDF logos: rasterize page 1 to PNG so the browser can render it on
    // the public page (PDFs would otherwise fall back to the monogram).
    // The original PDF is discarded.
    let fileToUpload = file;
    const isPdf =
      file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (kind === 'logo' && isPdf) {
      setUploading(true);
      const rasterized = await rasterizePdfFirstPage(file);
      setUploading(false);
      if (rasterized) {
        fileToUpload = rasterized;
      } else {
        onError?.(
          'Could not render this PDF in the browser. Uploading as-is - the public page will show the monogram fallback. For a visible logo, upload a PNG, JPG, or SVG instead.',
        );
      }
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', fileToUpload);
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
        accept={
          kind === 'logo'
            ? 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,application/postscript,.ai,.eps,.psd'
            : 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'
        }
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
          isPreviewableImage(value) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={emptyLabel}
              className="w-full h-full object-cover"
            />
          ) : (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-[10px] text-blue-700 hover:text-blue-900 px-1 text-center break-all leading-tight"
              title={`Open ${fileExtFromUrl(value).toUpperCase() || 'file'}`}
            >
              <span className="text-base" aria-hidden>📄</span>
              <span className="uppercase tracking-wide font-semibold">
                {fileExtFromUrl(value) || 'file'}
              </span>
            </a>
          )
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
