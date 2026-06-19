'use client';

// components/admin/ExportMenu.tsx
//
// Click-to-open export dropdown for the Mailing Hub pages. The previous
// implementation was a `group-hover` dropdown which silently fails on
// touch devices (iPad/iPhone admins) and also closes if the cursor
// momentarily leaves the trigger before hitting the menu items — that
// matched the "Export does nothing" report.
//
// Usage:
//   <ExportMenu disabled={busy !== null} onSelect={handleExport} />

import { useEffect, useRef, useState } from 'react';

type Format = 'csv' | 'tsv' | 'json';

export default function ExportMenu({
  disabled = false,
  onSelect,
  label = 'Export',
}: {
  disabled?: boolean;
  onSelect: (format: Format) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const pick = (f: Format) => {
    // Fire the export BEFORE we tear down state — some browsers block
    // window.open / programmatic navigations that happen after a React
    // re-render boundary in the same click handler.
    onSelect(f);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
      >
        {label} {'\u25be'}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-lg py-1 min-w-[140px]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => pick('csv')}
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            CSV
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => pick('tsv')}
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            TSV
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => pick('json')}
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            JSON
          </button>
        </div>
      )}
    </div>
  );
}
