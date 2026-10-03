'use client';

import { useState } from 'react';

export default function UploadButton({ token, docId, label = 'Upload' }: { token: string; docId: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');
  async function onPick(file: File | undefined) {
    if (!file) return;
    setState('busy'); setError('');
    const body = new FormData();
    body.set('file', file); body.set('docId', docId);
    try {
      const res = await fetch(`/api/deal-portal/${token}/upload`, { method: 'POST', body });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Upload failed'); setState('idle'); return; }
      setState('done');
    } catch { setError('Upload failed. Try again.'); setState('idle'); }
  }
  if (state === 'done') return <span className="text-xs font-semibold text-[#437A22]">Sent to your agent</span>;
  return (
    <span className="flex flex-col items-end gap-1">
      <label className="inline-flex min-h-[36px] cursor-pointer items-center rounded-md border border-[#301D5D] bg-white px-3 text-xs font-bold text-[#301D5D] hover:bg-[#F8F5FF]">
        {state === 'busy' ? 'Uploading' : label}
        <input type="file" accept="application/pdf,image/*" className="sr-only" disabled={state === 'busy'} onChange={(e) => void onPick(e.target.files?.[0])} />
      </label>
      {error && <span className="text-xs text-[#9A3D2B]" role="alert">{error}</span>}
    </span>
  );
}
