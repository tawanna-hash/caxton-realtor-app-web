'use client';

import { useEffect, useState } from 'react';

export type ApInfo = { status: 'sent' | 'opened' | 'paid'; email: string };

/** Loads the accounts-payable request status for a list of agreement ids. */
export function useApStatus(ids: string[]): Record<string, ApInfo> {
  const [map, setMap] = useState<Record<string, ApInfo>>({});
  const key = ids.join(',');
  useEffect(() => {
    if (!key) return;
    let alive = true;
    fetch(`/api/admin/agreements-v2/ap-status?ids=${encodeURIComponent(key)}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.byAgreement) setMap(j.byAgreement as Record<string, ApInfo>); })
      .catch(() => {});
    return () => { alive = false; };
  }, [key]);
  return map;
}

const LABEL = { sent: 'AP link sent', opened: 'AP link opened', paid: 'Payment details added' } as const;
const STYLE = {
  sent: 'bg-[color:var(--ds-selected)] text-[color:var(--ds-primary-press)]',
  opened: 'bg-blue-50 text-blue-800',
  paid: 'bg-green-50 text-green-800',
} as const;

export default function ApChip({ info }: { info?: ApInfo }) {
  if (!info) return null;
  return (
    <span title={info.email} className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[11px] font-medium ${STYLE[info.status]}`}>
      {LABEL[info.status]}
    </span>
  );
}
