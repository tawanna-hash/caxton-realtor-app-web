'use client';

import { useEffect, useRef } from 'react';

let synced = false;
/** Pulls the account preference once per page load and keeps a local copy for instant reads. */
function syncPreference() {
  if (synced || typeof window === 'undefined') return;
  synced = true;
  fetch('/api/closing-time/preferences', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((b) => {
    if (b && typeof b.hoverTips === 'boolean') { try { window.localStorage.setItem('ct-tips', b.hoverTips ? 'on' : 'off'); } catch { /* ignore */ } }
  }).catch(() => { synced = false; });
}

function floater(): HTMLDivElement {
  let el = document.getElementById('tip-float') as HTMLDivElement | null;
  if (!el) { el = document.createElement('div'); el.id = 'tip-float'; el.setAttribute('role', 'tooltip'); document.body.appendChild(el); }
  return el;
}

/**
 * Explanation shown on hover. Nothing is drawn. The tip attaches to the field right before it
 * (or right after it, or its container when it stands alone), so only that field reacts.
 */
export default function Tip({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const me = ref.current;
    if (!me) return;
    syncPreference();
    const host = (me.previousElementSibling ?? me.nextElementSibling ?? me.parentElement) as HTMLElement | null;
    if (!host) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      try { if (window.localStorage.getItem('ct-tips') === 'off') return; } catch { /* ignore */ }
      timer = setTimeout(() => {
        const el = floater(); const r = host.getBoundingClientRect();
        el.textContent = text;
        el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 336))}px`;
        el.style.top = `${r.bottom + 6}px`;
        el.style.opacity = '1';
      }, 350);
    };
    const hide = () => { if (timer) clearTimeout(timer); const el = document.getElementById('tip-float'); if (el) el.style.opacity = '0'; };
    host.classList.add('tip-host');
    host.addEventListener('mouseenter', show);
    host.addEventListener('mouseleave', hide);
    host.addEventListener('mousedown', hide);
    return () => { hide(); host.classList.remove('tip-host'); host.removeEventListener('mouseenter', show); host.removeEventListener('mouseleave', hide); host.removeEventListener('mousedown', hide); };
  }, [text]);
  return <span ref={ref} className="sr-only">{text}</span>;
}
