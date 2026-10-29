// components/ads/VideoSupport.tsx
//
// Shared "Video" / "Animated GIF" badge + spec line for ad placement docs
// (public placements, digital availability, media kit, checkout, admin).
// Reads AppAdSlot.video from lib/media-kit.ts — the single source of truth.

import Link from 'next/link';
import {
  APP_AD_SLOTS,
  EBLAST_VIDEO_SPECS,
  EXTRA_VIDEO_PLACEMENTS,
  VIDEO_FILE_SPECS,
  VIDEO_SPECS_PATH,
  type SlotVideoSupport,
} from '@/lib/media-kit';

export function VideoBadge({ video, className = '' }: { video?: SlotVideoSupport; className?: string }) {
  if (!video) return null;
  const isVideo = video.kind === 'video';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        isVideo ? 'border-[#B9E3C0] bg-[#EEF9F0] text-[#005A00]' : 'border-[#F2D98C] bg-[#FEF8CC] text-[#645600]'
      } ${className}`}
      title={isVideo ? 'Accepts MP4/MOV video. Plays muted and inline.' : 'Email placement. Video runs as an animated GIF / play-button banner.'}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M8 5v14l11-7z" />
      </svg>
      {isVideo ? 'Video' : 'Video via GIF'}
    </span>
  );
}

export function VideoSpecLine({
  video,
  className = 'text-[11px] text-gray-600',
  showLink = true,
}: {
  video?: SlotVideoSupport;
  className?: string;
  showLink?: boolean;
}) {
  if (!video) return null;
  return (
    <div className={className}>
      <span className="font-semibold text-gray-700">{video.kind === 'video' ? 'Video:' : 'e-Blast video:'}</span>{' '}
      <span>{video.spec}</span>
      {showLink && (
        <>
          {' '}
          <Link href={VIDEO_SPECS_PATH} className="text-brand-700 underline whitespace-nowrap">
            Video specs
          </Link>
        </>
      )}
    </div>
  );
}


function SpecTable({ rows, caption }: { rows: Array<{ label: string; value: string }>; caption: string }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
      <table className="min-w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <tbody className="divide-y divide-gray-200">
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="w-44 px-3 py-2 text-left align-top font-medium text-gray-900">{r.label}</th>
              <td className="px-3 py-2 align-top text-gray-700">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Video ad offering summary: file requirements, video-ready placements,
 * and the e-Blast GIF option. Used on /advertise/video-specs and in the
 * Media Kit (public + admin).
 */
export function VideoSpecsTables({ compact = false }: { compact?: boolean }) {
  const videoSlots = [
    ...APP_AD_SLOTS.filter((s) => s.video?.kind === 'video').map((s) => ({ slug: s.slug, name: s.name, video: s.video })),
    ...EXTRA_VIDEO_PLACEMENTS,
  ];
  const gifSlots = APP_AD_SLOTS.filter((s) => s.video?.kind === 'gif');
  const imageOnly = APP_AD_SLOTS.filter((s) => !s.video);
  const h = compact ? 'text-sm font-semibold text-gray-900 mb-2' : 'text-lg font-semibold text-gray-900 mb-3';
  return (
    <div className="space-y-6">
      <div>
        <h3 className={h}>Video-ready placements</h3>
        <ul className="divide-y divide-gray-200 rounded-md ring-1 ring-gray-200">
          {videoSlots.map((s) => (
            <li key={s.slug} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-medium text-gray-900">{s.name}</span>
              <span className="text-gray-700">{s.video?.spec}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className={h}>File requirements</h3>
        <SpecTable rows={VIDEO_FILE_SPECS} caption="Video file requirements" />
      </div>
      {gifSlots.length > 0 && (
        <div>
          <h3 className={h}>e-Blast video option</h3>
          <p className="mb-2 text-sm text-gray-700">
            Email apps like Gmail and Outlook can&apos;t play video, so e-Blast video runs as an animated
            &ldquo;click to watch&rdquo; banner. Readers click it to watch the full video in their browser.
          </p>
          <SpecTable rows={EBLAST_VIDEO_SPECS} caption="e-Blast video banner requirements" />
        </div>
      )}
      {!compact && (
        <div>
          <h3 className={h}>Image-only placements</h3>
          <p className="text-sm text-gray-700">
            {imageOnly.map((s) => s.name).join(' · ')}. Send a PNG, JPEG, WebP, or GIF (10 MB max).
          </p>
        </div>
      )}
    </div>
  );
}
