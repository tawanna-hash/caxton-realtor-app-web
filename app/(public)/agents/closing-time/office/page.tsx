import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { isClosingTimeGated } from '@/lib/server/closing-time-gate';
import { getAdminBrokerage, officeOverview } from '@/lib/server/closing-time-brokerage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Office Dashboard | Closing Time', robots: { index: false, follow: false } };

const fmt = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }) : '');

export default async function OfficeDashboardPage() {
  if (await isClosingTimeGated()) notFound();
  const user = await getCurrentUser();
  const brokerage = user ? await getAdminBrokerage(user.realtorId) : null;
  if (!brokerage) notFound();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const agents = await officeOverview(brokerage.id, today);
  const totals = agents.reduce((a, x) => ({ deals: a.deals + x.activeDeals, urgent: a.urgent + x.urgent, watch: a.watch + x.watch }), { deals: 0, urgent: 0, watch: 0 });
  return (
    <main id="agent-desk" className="mx-auto my-6 max-w-5xl rounded-2xl border border-[#E6E5EC] bg-white px-5 py-8 sm:px-8 sm:py-10">
      <p className="ds-eyebrow">Office dashboard</p>
      <h1 className="ds-title">{brokerage.name}</h1>
      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-bold text-slate-950">{totals.deals}</p><p className="text-xs text-slate-600">Active deals</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-bold text-[#9A3D2B]">{totals.urgent}</p><p className="text-xs text-slate-600">Urgent risks</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-2xl font-bold text-slate-950">{totals.watch}</p><p className="text-xs text-slate-600">To watch</p></div>
      </div>
      <div className="mt-5 flex gap-3 text-sm font-bold">
        <a className="underline text-[#301D5D]" href="/api/closing-time/office/export">Export office deals (CSV)</a>
        <Link className="underline text-[#301D5D]" href="/agents/closing-time">Back to Closing Time</Link>
      </div>
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[#FBFBFD]">
            <tr><th className="p-3">Agent</th><th className="p-3">Deals</th><th className="p-3">Urgent</th><th className="p-3">Watch</th><th className="p-3">Drafts</th><th className="p-3">Next date</th></tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.realtorId} className="border-t border-slate-100 align-top">
                <td className="p-3"><p className="font-semibold text-slate-950">{a.name || a.email}</p><p className="text-xs text-slate-500">{a.email}</p></td>
                <td className="p-3">{a.activeDeals}</td>
                <td className={`p-3 font-semibold ${a.urgent ? 'text-[#9A3D2B]' : ''}`}>{a.urgent}</td>
                <td className="p-3">{a.watch}</td>
                <td className="p-3">{a.draftsWaiting}</td>
                <td className="p-3 text-slate-600">{a.nextDate ? `${fmt(a.nextDate)}: ${a.nextLabel}` : 'None'}</td>
              </tr>
            ))}
            {!agents.length && <tr><td className="p-4 text-slate-500" colSpan={6}>No agents have been added to this office yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
