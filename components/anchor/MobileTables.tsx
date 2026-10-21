'use client';

import { useEffect } from 'react';

// On phones, beta tables stack each row as its own block instead of sliding
// sideways. Cells get a data-label from the matching header so CSS can show it.
export default function MobileTables() {
  useEffect(() => {
    const label = () => {
      document.querySelectorAll<HTMLTableElement>("[data-admin-ui='true'] table").forEach((t) => {
        const heads = Array.from(t.querySelectorAll('thead th')).map((h) => (h.textContent || '').replace(/[▲▼▴▾↕↑↓]/g, '').trim());
        if (!heads.length) return;
        t.querySelectorAll('tbody tr').forEach((tr) => {
          Array.from(tr.children).forEach((c, i) => {
            if (c instanceof HTMLElement && c.dataset.label === undefined) c.dataset.label = heads[i] || '';
          });
        });
      });
    };
    label();
    let raf = 0;
    const mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(label); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  return null;
}
