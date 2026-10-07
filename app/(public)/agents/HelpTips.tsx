'use client';

import { useEffect, useState } from 'react';

type Entry = { label: string; text: string };

/** Reads every Tip currently on the page (each renders its text in a hidden span next to its field). */
function collect(): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  document.querySelectorAll<HTMLElement>('span.sr-only').forEach((span) => {
    const host = (span.previousElementSibling ?? span.nextElementSibling ?? span.parentElement) as HTMLElement | null;
    if (!host || !host.classList.contains('tip-host')) return;
    const rect = host.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const text = (span.textContent ?? '').trim();
    if (!text) return;
    const heading = host.querySelector('h1,h2,h3,h4')?.textContent?.trim();
    const label = (host.getAttribute('aria-label') || host.getAttribute('placeholder') || (host as HTMLInputElement).name
      || heading || (host.innerText ?? '').trim().split('\n')[0] || 'Field').slice(0, 60);
    const key = `${label}|${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, text });
  });
  return out;
}

export default function HelpTips() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Entry[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setItems(collect());
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const shown = items.filter((i) => `${i.label} ${i.text}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <button type="button" className="ct-help-btn" aria-label="Help: all tips on this page" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span aria-hidden="true">?</span><span className="ct-help-label">Help</span>
      </button>
      {open && (
        <div className="ct-help-scrim" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Help" className="ct-help-panel" onClick={(e) => e.stopPropagation()}>
            <div className="ct-help-head">
              <h2>Help: Tips On This Page</h2>
              <button type="button" aria-label="Close help" onClick={() => setOpen(false)}>Close</button>
            </div>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tips" aria-label="Search tips" />
            <ul>
              {shown.map((i, n) => (
                <li key={n}><strong>{i.label}</strong><span>{i.text}</span></li>
              ))}
              {shown.length === 0 && <li><span>{items.length === 0 ? 'No tips on this page.' : 'No tips match your search.'}</span></li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
