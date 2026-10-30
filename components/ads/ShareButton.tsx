'use client';

// Share: native share sheet (attaches the PDF when the device supports
// file sharing), otherwise copies the page link to the clipboard.
import { useState } from 'react';
import type { jsPDF } from 'jspdf';

type Props = {
  title: string;
  text: string;
  path: string; // e.g. '/advertise/video-specs'
  buildPdf?: () => Promise<{ doc: jsPDF; filename: string }>;
};

export function ShareButton({ title, text, path, buildPdf }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };

  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    setBusy(true);
    try {
      if (typeof navigator.share === 'function') {
        let files: File[] | undefined;
        if (buildPdf) {
          try {
            const { doc, filename } = await buildPdf();
            const f = new File([doc.output('blob')], filename, { type: 'application/pdf' });
            if (navigator.canShare?.({ files: [f] })) files = [f];
          } catch { /* fall back to link-only share */ }
        }
        try {
          await navigator.share(files ? { title, text, url, files } : { title, text, url });
          return;
        } catch (e) {
          if ((e as DOMException)?.name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(url);
      flash('Link copied');
    } catch {
      flash('Could not share');
    } finally {
      setBusy(false);
    }
  };

  const btn = 'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium ring-1 ring-[#42277C]/30 text-[#42277C] hover:bg-[#42277C]/5 disabled:opacity-50';
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className={btn} onClick={share} disabled={busy}>Share</button>
      {msg && <span className="text-xs text-gray-700" role="status">{msg}</span>}
    </span>
  );
}
