// Sort indicator in the Billing Hub dropdown style: small solid triangle.
// Points down when descending or unsorted (dimmed), up when ascending.
export default function SortCaret({ dir }: { dir?: 'asc' | 'desc' }) {
  return <span aria-hidden="true" className={`inline-block text-[10px] leading-none ${dir ? 'text-[color:var(--ds-ink)]' : 'opacity-40'} ${dir === 'asc' ? 'rotate-180' : ''}`}>&#9660;</span>;
}
