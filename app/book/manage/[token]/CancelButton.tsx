'use client';

import { useState } from 'react';

export default function CancelButton({ token, label, done }: { token: string; label: string; done: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  if (state === 'done') return <span className="inline-flex min-h-[44px] items-center rounded-lg bg-[#FFEAE6] px-4 text-[13px] font-medium text-[#661102]">{done}</span>;
  return (
    <button type="button" disabled={state === 'busy'} className="inline-flex min-h-[44px] items-center rounded-lg border border-[#F1C9C1] bg-white px-4 text-[13px] font-medium text-[#661102] hover:bg-[#FFEAE6] disabled:opacity-45"
      onClick={async () => {
        if (!window.confirm(`${label}?`)) return;
        setState('busy');
        const r = await fetch(`/api/book/manage/${token}`, { method: 'POST' }).catch(() => null);
        setState(r?.ok ? 'done' : 'error');
      }}>{state === 'error' ? 'Try Again' : label}</button>
  );
}
