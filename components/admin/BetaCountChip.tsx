'use client';

// Count chip on a Beta nav item: how many documents the page holds.
import { useEffect, useState } from 'react';

let pending: Promise<Record<string, number>> | null = null;
let stamp = 0;
function load(): Promise<Record<string, number>> {
  if (!pending || Date.now() - stamp > 30_000) {
    stamp = Date.now();
    pending = fetch('/api/admin/beta-nav-counts', { credentials: 'include', cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  }
  return pending;
}

export default function BetaCountChip({ href }: { href: string }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((j) => { if (alive && typeof j[href] === 'number') setN(j[href]); });
    return () => { alive = false; };
  }, [href]);
  if (n === null) return null;
  return <span className="ml-auto shrink-0 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium leading-none text-brand-700" aria-label={`${n} documents`}>{n}</span>;
}
