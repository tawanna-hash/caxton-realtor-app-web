'use client';

// Download PDF + Export (CSV / Excel) for the Video Ad Specs sheet.
import { useState } from 'react';
import { buildVideoSpecsPdf, videoSpecsSheets } from '@/lib/ad-specs-export';
import { ExportMenu } from '@/components/ads/ExportMenu';
import { ShareButton } from '@/components/ads/ShareButton';

export function VideoSpecsActions() {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const { doc, filename } = await buildVideoSpecsPdf();
      doc.save(filename);
    } finally { setBusy(false); }
  };
  const btn = 'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium ring-1 ring-[#42277C]/30 text-[#42277C] hover:bg-[#42277C]/5 disabled:opacity-50';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn} onClick={download} disabled={busy}>{busy ? 'Preparing…' : 'Download PDF'}</button>
      <ExportMenu sheets={videoSpecsSheets} basename="video-ad-specs-realty-news-now" />
      <ShareButton
        title="Video Ad Specs — Realty News Now"
        text="Video ad specifications for RealtyLine Austin and Newsline San Antonio."
        path="/advertise/video-specs"
        buildPdf={buildVideoSpecsPdf}
      />
    </div>
  );
}
