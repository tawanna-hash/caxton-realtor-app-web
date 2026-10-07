import { notFound } from 'next/navigation';
import { resolveBooking } from '@/lib/server/closing-time-schedulers';
import { T } from '@/lib/scheduler-shared';
import BookingClient from './BookingClient';

/** Shared by /book/<slug> and /book/<slug>/<alias>. */
export default async function BookingView({ slug, alias }: { slug: string; alias: string }) {
  const r = await resolveBooking(slug, alias);
  if (!r) notFound();
  if (r.kind === 'none') {
    return <main className="mx-auto max-w-[560px] px-4 py-16 text-center font-[Inter,system-ui,sans-serif] text-[15px] text-[#51555b]">{T.en.notLive}</main>;
  }
  if (r.kind === 'list') {
    return (
      <main className="mx-auto max-w-[640px] px-4 py-8 font-[Inter,system-ui,sans-serif]">
        <div className="rounded-xl border border-[#d4d8dd] bg-white p-6">
          {r.agentName && <div className="text-[14px] font-semibold text-[#005a8f]">{r.agentName}</div>}
          <h1 className="mt-1 text-[22px] font-semibold text-[#292a2d]">{r.title || T.en.choose}</h1>
          <ul className="mt-4 space-y-2">
            {r.items.map((i) => (
              <li key={i.href}>
                <a href={i.href} className="flex items-center justify-between gap-3 rounded-lg border border-[#d4d8dd] px-4 py-3 transition hover:border-[#005a8f] hover:bg-[#f5f6f9]">
                  <span className="min-w-0"><span className="block text-[15px] font-semibold text-[#292a2d]">{i.name}</span>{i.welcome && <span className="block truncate text-[13px] text-[#51555b]">{i.welcome}</span>}</span>
                  <span className="shrink-0 text-[13px] font-medium text-[#51555b]">{i.lengths.map((l) => `${l} min`).join(' / ')}</span>
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
