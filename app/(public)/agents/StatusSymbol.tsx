/** Astro status symbols: shape plus color, so color is never the only signal. */
export default function StatusSymbol({ label }: { label: string }) {
  const k = label.toLowerCase();
  const common = { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true, className: 'mr-1.5 inline-block shrink-0 align-[-1px]' } as const;
  if (k === 'overdue') return <svg {...common}><polygon points="6,1 11.5,11 0.5,11" fill="#ff2a04" /></svg>;
  if (k === 'needs attention') return <svg {...common}><rect x="1.5" y="1.5" width="9" height="9" fill="#fad800" /></svg>;
  if (k === 'at risk') return <svg {...common}><polygon points="6,0.5 11.5,6 6,11.5 0.5,6" fill="#ffaf3d" /></svg>;
  if (k === 'on track') return <svg {...common}><circle cx="6" cy="6" r="5" fill="#00e200" /></svg>;
  if (k === 'closed') return <svg {...common}><circle cx="6" cy="6" r="4" fill="none" stroke="#64d9ff" strokeWidth="2" /></svg>;
  return <svg {...common}><circle cx="6" cy="6" r="5" fill="#9aa0a6" /></svg>;
}
