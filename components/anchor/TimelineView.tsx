'use client';

// Anchor-style billing timeline: a vertical rail of dated steps.

export type TimelineEntryView = { date: string | null; label: string; amount_cents: number | null; note?: string };
export type TimelineView =
  | { ok: true; entries: TimelineEntryView[]; hidden: number }
  | { ok: false; reason: string }
  | null
  | undefined;

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const fmt = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Today');

export default function BillingTimeline({ timeline, empty }: { timeline: TimelineView; empty?: string }) {
  if (!timeline) return null;
  if (!timeline.ok) {
    return <p className="text-sm text-[#6E6A8A]">{empty ?? 'The timeline appears once a start date and amount are set.'}</p>;
  }
  return (
    <ol className="relative ml-2 border-l-2 border-[#D8D5E6]">
      {timeline.entries.map((e, i) => (
        <li key={i} className="relative pb-5 pl-6 last:pb-0">
          <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-[#5B3FE3] bg-white" aria-hidden="true" />
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="text-sm font-medium text-[#261E5A]">{e.label}</span>
            {e.amount_cents != null && <span className="text-sm font-semibold text-[#261E5A]">{money(e.amount_cents)}</span>}
          </div>
          <div className="text-xs text-[#6E6A8A]">{fmt(e.date)}{e.note ? ` · ${e.note}` : ''}</div>
        </li>
      ))}
      {timeline.hidden > 0 && <li className="pl-6 text-xs text-[#6E6A8A]">and {timeline.hidden} more</li>}
    </ol>
  );
}
