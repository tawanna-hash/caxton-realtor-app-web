'use client';

// Pop-up hosts for the agreement builder: create a template, use a template.
// The builder runs inside the pop-up and asks it to close with a postMessage.

import { useEffect, useState } from 'react';
import { A } from '@/components/anchor/ui';

export function BuilderPopup({ query, title, onClose }: { query: string; title: string; onClose: (to?: string) => void }) {
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'builder-close') return;
      onClose(typeof e.data.to === 'string' ? e.data.to : undefined);
    };
    window.addEventListener('message', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('message', h); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-full max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-[10px] bg-white shadow-xl">
        <iframe title={title} src={`/admin/agreements/renewals-v2/new?embed=1${query}`} className="h-full w-full border-0" />
      </div>
    </div>
  );
}
