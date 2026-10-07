'use client';

import { useState, type ReactNode } from 'react';
import { Camera, ChevronDown, FileUp, Upload } from 'lucide-react';

/** Upload menu (choose file or photo) and Open button shared by the Documents tab and the Forms Library. */
export default function TrecFormActions({
  family,
  disabled = false,
  onOpen,
  onUpload,
  extra,
}: {
  family: string;
  disabled?: boolean;
  onOpen: (family: string) => void;
  onUpload: (family: string, mode: 'file' | 'photo') => void;
  extra?: ReactNode;
}) {
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        onClick={(event) => {
          if (menu) { setMenu(null); return; }
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
        }}
        className="ds-row-btn"
      >
        <Upload className="h-3.5 w-3.5" aria-hidden="true" />Upload<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button type="button" disabled={disabled} onClick={() => onOpen(family)} className="ds-row-btn">Open</button>
      {extra}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} aria-hidden="true" />
          <div role="menu" style={{ top: menu.top, right: menu.right }} className="fixed z-50 w-[300px] max-w-[calc(100vw-16px)] rounded-2xl border border-[#d4d8dd] bg-white p-2 shadow-lg">
            <button type="button" role="menuitem" onClick={() => { setMenu(null); onUpload(family, 'file'); }} className="ds-upload-opt">
              <span className="ds-upload-ico"><FileUp className="h-4 w-4" aria-hidden="true" /></span>Choose PDF or Image
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenu(null); onUpload(family, 'photo'); }} className="ds-upload-opt">
              <span className="ds-upload-ico"><Camera className="h-4 w-4" aria-hidden="true" /></span>Take a Photo
            </button>
            <p className="border-t border-[#f5f6f9] px-3 pb-2 pt-3 text-xs leading-5 text-slate-500">PDF, PNG, JPG, or WEBP · 15 MB maximum. PDFs are kept privately with the deal; images are used for extraction only.</p>
          </div>
        </>
      )}
    </>
  );
}
