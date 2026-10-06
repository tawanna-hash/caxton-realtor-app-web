import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicPoll, slotLabel } from '@/lib/server/closing-time-polls';
import PollForm from './PollForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pick Your Times', robots: { index: false, follow: false } };

const lab = 'text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]';

export default async function SchedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const poll = await getPublicPoll(token);
  if (!poll) notFound();
  const final = poll.options.find((o) => o.id === poll.finalOptionId);
  const first = poll.name.split(/\s+/)[0];

  return (
    <main className="mx-auto max-w-[720px] px-4 py-8 font-[Inter,system-ui,sans-serif] text-[14px] text-[#4A4757]">
      <div className="overflow-hidden rounded-xl border border-[#E6E5EC] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#E6E5EC] px-6 py-3">
          <div>
            <div className="text-[14px] font-semibold text-[#301D5D]">{poll.agentName}</div>
            <div className={lab}>Scheduling</div>
          </div>
          {poll.agentEmail && <a className="rounded-lg border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B1726] transition hover:border-[#301D5D] hover:bg-[#301D5D] hover:text-white" href={`mailto:${poll.agentEmail}`}>Email Your Agent</a>}
        </div>
        <div className="space-y-4 p-6">
          <div>
            {poll.property && <div className={lab}>{poll.property}</div>}
            <h1 className="mt-0.5 text-[22px] font-semibold leading-tight text-[#1B1726]">{poll.title}</h1>
            <p className="mt-1 text-[12px] font-medium text-[#7A7787]">
              {[poll.location && `Where: ${poll.location}`, poll.durationMin && `About ${poll.durationMin} minutes`, 'All times Central'].filter(Boolean).join(' · ')}
            </p>
            {poll.note && <p className="mt-2 text-[14px] text-[#4A4757]">{poll.note}</p>}
          </div>

          {final ? (
            <section className="rounded-[10px] border border-[#301D5D] bg-[#F6F3FB] p-4">
              <div className={lab}>Confirmed</div>
              <div className="mt-1 text-[18px] font-semibold text-[#1B1726]">{slotLabel(final.date, final.time)}</div>
              <a href={`/api/schedule/${token}/ics`} className="mt-3 inline-flex rounded-lg bg-[#301D5D] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#42277C]">Add To Calendar</a>
            </section>
          ) : poll.status === 'closed' ? (
            <p className="rounded-[10px] border border-[#E6E5EC] p-4">This poll is closed. Your agent will be in touch.</p>
          ) : (
            <PollForm token={token} firstName={first} options={poll.options.map((o) => ({ id: o.id, label: slotLabel(o.date, o.time), yes: o.yes, maybe: o.maybe }))}
              initialVotes={poll.votes} initialComment={poll.comment} responded={poll.responded} invited={poll.invited} />
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-[12px] text-[#7A7787]">This link is private to you. Only your agent sees who answered.</p>
    </main>
  );
}
