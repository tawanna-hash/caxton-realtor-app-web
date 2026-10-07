import { notFound } from 'next/navigation';
import { resolveBooking } from '@/lib/server/closing-time-schedulers';
import { T } from '@/lib/scheduler-shared';
import BookingClient from './BookingClient';

/** Shared by /book/<slug> and /book/<slug>/<alias>. */
export default async function BookingView({ slug, alias }: { slug: string; alias: string }) {
  const r = await resolveBooking(slug, alias);
  if (!r) notFound();
  if (r.kind === 'none') {
    return <main className="mx-auto max-w-[560px] px-4 py-16 text-center font-[Inter,system-ui,sans-serif] text-[15px] text-[#4A4757]">{T.en.notLive}</main>;
  }
  if (r.kind === 'list') {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-8 font-[Inter,system-ui,sans-serif]">
        <div className="rounded-xl border border-[#E6E5EC] bg-white p-6">
          {r.agentName && <div className="text-[14px] font-semibold text-[#301D5D]">{r.agentName}</div>}
          <h1 className="mt-1 text-[22px] font-semibold text-[#1B1726]">{r.title || T.en.choose}</h1>
          <ul className="mt-4 space-y-2">
            {r.items.map((i) => (
              <li key={i.href}>
                <a href={i.href} className="flex items-center justify-between gap-3 rounded-lg border border-[#E6E5EC] px-4 py-3 transition hover:border-[#301D5D] hover:bg-[#F6F3FB]">
                  <span className="min-w-0"><span className="block text-[15px] font-semibold text-[#1B1726]">{i.name}</span>{i.welcome && <span className="block truncate text-[13px] text-[#4A4757]">{i.welcome}</span>}</span>
                  <span className="shrink-0 text-[13px] font-medium text-[#4A4757]">{i.lengths.map((l) => `${l} min`).join(' / ')}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </main>
    );
  }
  return <BookingClient scheduler={r.scheduler} />;
}
