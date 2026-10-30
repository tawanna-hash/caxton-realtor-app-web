'use client';

// "Export" dropdown: CSV or Excel. Used on the Digital Ad Slots card and
// the Video Ad Specs page.
import { useEffect, useRef, useState } from 'react';
import { downloadCsv, downloadXlsx, type Sheet } from '@/lib/ad-specs-export';

export function ExportMenu({ sheets, basename, className = '' }: { sheets: () => Sheet[]; basename: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const run = async (kind: 'csv' | 'xlsx') => {
    setBusy(true);
    try {
      if (kind === 'csv') downloadCsv(sheets(), `${basename}.csv`);
      else await downloadXlsx(sheets(), `${basename}.xlsx`);
    } finally { setBusy(false); setOpen(false); }
  };
  const btn = 'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium ring-1 ring-[#42277C]/30 text-[#42277C] hover:bg-[#42277C]/5 disabled:opacity-50';
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" className={btn} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={busy}>
        {busy ? 'Exporting…' : 'Export ▾'}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md bg-white shadow-lg ring-1 ring-gray-200">
          <button role="menuitem" type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => run('xlsx')}>Excel (.xlsx)</button>
          <button role="menuitem" type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => run('csv')}>CSV (.csv)</button>
        </div>
      )}
    </div>
  );
}
