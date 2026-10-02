import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPortalView } from '@/lib/server/closing-time-assist';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your Closing Progress', robots: { index: false, follow: false } };

const statusLabel: Record<string, string> = { requested: 'Requested', received: 'Received', reviewed: 'Reviewed' };
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

export default async function DealPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getPortalView(token);
  if (!view) notFound();
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7059A8]">Closing progress</p>
      <h1 className="mt-2 text-2xl font-bold text-[#301D5D]">{view.property}</h1>
      <p className="mt-1 text-sm text-slate-600">{view.stage}{view.closingDate ? ` · Closing ${fmt(view.closingDate)}` : ''}</p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-950">Key dates</h2>
        <ol className="mt-3 space-y-2">
          {view.timeline.map((item) => (
            <li key={item.label + item.date} className="flex items-center justify-between border border-slate-200 bg-white px-4 py-3 text-sm">
              <span className={item.done ? 'text-slate-500 line-through' : 'font-semibold text-slate-900'}>{item.label}</span>
              <span className="text-slate-600">{fmt(item.date)}</span>
            </li>
          ))}
          {!view.timeline.length && <li className="text-sm text-slate-500">Dates will appear once the contract is entered.</li>}
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-950">What we need from you</h2>
        <ul className="mt-3 space-y-2">
          {view.todos.map((t) => (
            <li key={t.title} className="border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900">{t.title}{t.dueDate ? <span className="text-slate-500"> · by {fmt(t.dueDate)}</span> : null}</li>
          ))}
          {!view.todos.length && <li className="text-sm text-slate-500">Nothing right now.</li>}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-950">Documents</h2>
        <ul className="mt-3 space-y-2">
          {view.documents.map((d) => (
            <li key={d.label} className="flex items-center justify-between border border-slate-200 bg-white px-4 py-3 text-sm">
              <span className="text-slate-900">{d.label}</span>
              <span className="font-semibold text-[#301D5D]">{statusLabel[d.status] ?? d.status}</span>
            </li>
          ))}
          {!view.documents.length && <li className="text-sm text-slate-500">No documents requested yet.</li>}
        </ul>
      </section>

      <p className="mt-10 text-sm text-slate-600">Questions? Contact {view.agentName || 'your agent'}{view.agentEmail ? <> at <a className="font-semibold text-[#301D5D] underline" href={`mailto:${view.agentEmail}`}>{view.agentEmail}</a></> : null}.</p>
    </main>
  );
}
