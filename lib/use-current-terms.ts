'use client';

import { useEffect, useState } from 'react';

/** Terms text currently in effect (from Get Paid > Agreement terms), or null until loaded. */
export function useCurrentTerms(): string | null {
  const [terms, setTerms] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/admin/agreement-terms')
      .then((r) => r.json())
      .then((d: { versions?: Array<{ body: string; effective_at: string }> }) => {
        const cur = d.versions?.find((v) => new Date(v.effective_at).getTime() <= Date.now());
        if (live && cur) setTerms(cur.body);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return terms;
}
