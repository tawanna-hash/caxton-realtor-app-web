import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import UploadButton from './UploadButton';
import { getPortalView } from '@/lib/server/closing-time-assist';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your Closing Progress', robots: { index: false, follow: false } };

const statusLabel: Record<string, string> = { requested: 'Requested', received: 'Received', reviewed: 'Reviewed' };
const parts = (d: string) => new Date(`${d}T12:00:00Z`);
const short = (d: string) => parts(d).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const weekday = (d: string, w: 'short' | 'long' = 'short') => parts(d).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: w });
const long = (d: string) => parts(d).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

const card = 'rounded-[10px] border border-[#E6E5EC] bg-white';
const lab = 'text-[11px] font-medium uppercase tracking-[0.06em] text-[#7A7787]';

export default async function DealPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getPortalView(token);
  if (!view) notFound();

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const next = view.timeline.find((i) => !i.done);
  const nextDays = next ? Math.round((Date.parse(`${next.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000) : null;
  const who = view.clientFirstName;
  const headline = view.clientSide === 'seller'
    ? `${who ? `${who}, Here Is` : 'Here Is'} Your Sale Of ${view.property}`
    : `${view.property} Is Almost Yours${who ? `, ${who}` : ''}`;
  const stats: [string, string][] = [
    [view.daysToClosing === null ? '-' : String(view.daysToClosing), 'Days To Closing'],
    [nextDays === null || nextDays < 0 ? '-' : String(nextDays), 'Days To Next Deadline'],
    [String(view.documents.length), 'Documents'],
  ];

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8 font-[Inter,system-ui,sans-serif] text-[14px] text-[#4A4757]">
      <div className="overflow-hidden rounded-xl border border-[#E6E5EC] bg-white">
        <div className="flex items-center justify-between border-b border-[#E6E5EC] px-6 py-3">
          <div>
            <div className="text-[14px] font-semibold text-[#301D5D]">{view.agentName ? `${view.agentName}` : 'Your Agent'}</div>
            <div className={lab}>Client Portal</div>
          </div>
          {view.agentEmail && <a className="rounded-lg border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B1726] transition hover:border-[#301D5D] hover:bg-[#301D5D] hover:text-white" href={`mailto:${view.agentEmail}`}>Email Your Agent</a>}
        </div>

        <div className="space-y-4 p-6">
          <div>
            <div className={lab}>{view.stage}</div>
            <h1 className="mt-0.5 text-[22px] font-semibold leading-tight text-[#1B1726]">{headline}</h1>
            {view.closingDate && <p className="mt-1 text-[12px] font-medium text-[#7A7787]">Closing {long(view.closingDate)}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {stats.map(([n, l]) => (
              <div key={l} className={`${card} p-4`}>
                <div className="text-[24px] font-semibold text-[#1B1726]">{n}</div>
                <div className="text-[12px] font-medium text-[#7A7787]">{l}</div>
              </div>
            ))}
          </div>

          <section className={card}>
            <h2 className="border-b border-[#E6E5EC] px-4 py-3.5 text-[14px] font-semibold text-[#1B1726]">Where Your Purchase Stands</h2>
            <ol className="flex overflow-x-auto p-4">
              {view.steps.map((s) => (
                <li key={s.label} className="relative min-w-[110px] flex-1 pt-[18px] text-[12px] font-medium" style={{ color: s.state === 'upcoming' ? '#7A7787' : '#301D5D' }}>
                  <span className="absolute left-0 right-0 top-[5px] h-[2px]" style={{ background: s.state === 'done' ? '#301D5D' : '#E6E5EC' }} />
                  <span className="absolute left-0 top-0 h-3 w-3 rounded-full border-2" style={{ borderColor: s.state === 'upcoming' ? '#E6E5EC' : '#301D5D', background: s.state === 'upcoming' ? '#fff' : '#301D5D' }} />
                  {s.label}
                  {s.date && <span className="block font-normal text-[#7A7787]">{short(s.date)}</span>}
                </li>
              ))}
            </ol>
          </section>

          {next && (
            <section className={`${card} flex flex-wrap items-center gap-5 border-[#301D5D] p-4`}>
              <div>
                <div className="text-[44px] font-semibold leading-none text-[#301D5D]">{short(next.date)}</div>
                <div className="mt-1 text-[12px] font-medium text-[#7A7787]">{weekday(next.date, 'long')}</div>
              </div>
              <div className="min-w-[220px] flex-1">
                <div className={lab}>Next Deadline</div>
                <div className="text-[14px] font-medium text-[#1B1726]">{next.label}</div>
                {next.note && <div className="text-[12px] font-medium text-[#7A7787]">{next.note}</div>}
              </div>
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <section className={card}>
              <h2 className="border-b border-[#E6E5EC] px-4 py-3.5 text-[14px] font-semibold text-[#1B1726]">All Deadlines</h2>
              <ul className="px-4">
                {view.timeline.map((i) => (
                  <li key={i.id} className="flex gap-4 border-b border-[#E6E5EC] py-3 last:border-0">
                    <div className="w-16 shrink-0">
                      <div className="text-[14px] font-medium text-[#1B1726]">{short(i.date)}</div>
                      <div className="text-[12px] font-medium text-[#7A7787]">{weekday(i.date)}</div>
                    </div>
                    <div>
                      <div className={`text-[14px] font-medium ${i.done ? 'text-[#7A7787] line-through' : 'text-[#1B1726]'}`}>{i.label}</div>
                      {i.note && <div className="text-[12px] font-medium text-[#7A7787]">{i.note}</div>}
                    </div>
                  </li>
                ))}
                {!view.timeline.length && <li className="py-3 text-[#7A7787]">Dates appear once the contract is entered.</li>}
              </ul>
            </section>

            <section className={card}>
              <div className="flex items-center justify-between border-b border-[#E6E5EC] px-4 py-3.5">
                <h2 className="text-[14px] font-semibold text-[#1B1726]">Documents</h2>
                <span className="text-[12px] font-medium text-[#7A7787]">{view.documents.length} Total</span>
              </div>
              <ul className="px-4">
                {view.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 border-b border-[#E6E5EC] py-3 last:border-0">
                    <span className="text-[14px] font-medium text-[#1B1726]">{d.label}</span>
                    {d.status === 'requested'
                      ? <UploadButton token={token} docId={d.id} />
                      : <span className="flex items-center gap-3"><span className="text-[12px] font-medium text-[#301D5D]">{statusLabel[d.status] ?? d.status}</span><UploadButton token={token} docId={d.id} label="Upload New" /></span>}
                  </li>
                ))}
                {!view.documents.length && <li className="py-3 text-[#7A7787]">No documents requested yet.</li>}
              </ul>
            </section>
          </div>

          {view.forms.length > 0 && (
            <section className={card}>
              <div className="flex items-center justify-between border-b border-[#E6E5EC] px-4 py-3.5">
                <h2 className="text-[14px] font-semibold text-[#1B1726]">Deal Forms</h2>
                <span className="text-[12px] font-medium text-[#7A7787]">View Only</span>
              </div>
              <ul className="px-4">
                {view.forms.map((f) => (
                  <li key={f.family} className="flex items-center justify-between gap-3 border-b border-[#E6E5EC] py-3 last:border-0">
                    <span className="text-[14px] font-medium text-[#1B1726]">{f.label}</span>
                    <a href={`/api/deal-portal/${token}/form/${encodeURIComponent(f.family)}`} target="_blank" rel="noreferrer" className="rounded-lg border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B1726] transition hover:border-[#301D5D] hover:bg-[#301D5D] hover:text-white">View</a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {view.todos.length > 0 && (
            <section className={card}>
              <h2 className="border-b border-[#E6E5EC] px-4 py-3.5 text-[14px] font-semibold text-[#1B1726]">What We Need From You</h2>
              <ul className="px-4">
                {view.todos.map((t) => (
                  <li key={t.title} className="flex justify-between gap-3 border-b border-[#E6E5EC] py-3 last:border-0">
                    <span className="text-[14px] font-medium text-[#1B1726]">{t.title}</span>
                    {t.dueDate && <span className="text-[12px] font-medium text-[#301D5D]">By {short(t.dueDate)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="rounded-[10px] border border-[#E6E5EC] bg-[#F6F3FB] p-4">
            <span className="font-semibold text-[#1B1726]">A Note On Wiring Money.</span> Never wire funds from emailed instructions alone. Call the title company on its published number to verify. Real instructions do not change at the last minute.
          </div>
        </div>
      </div>
    </main>
  );
}
