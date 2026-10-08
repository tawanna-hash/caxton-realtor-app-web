import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { storageUsage } from '@/lib/server/closing-time-storage-usage';

export const dynamic = 'force-dynamic';

const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

export default async function AdminStoragePage() {
  const admin = await getCurrentAdmin().catch(() => null);
  if (!admin) redirect('/admin/login');
  const u = await storageUsage();
  const tile = (label: string, value: string, note?: string) => (
    <div className="rounded-lg border border-[#E6E5EC] bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#7A7787]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#301D5D]">{value}</p>
      {note && <p className="mt-1 text-[12px] text-[#7A7787]">{note}</p>}
    </div>
  );
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 text-[#1B1726]">
      <h1 className="font-serif text-3xl text-[#301D5D]">Storage Usage</h1>
      <p className="mt-2 text-[14px] text-[#4A4757]">What the database holds for Closing Time, and how much of it is files that move to each agent&rsquo;s own document storage.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tile('Whole Database', size(u.databaseBytes), `About $${u.monthlyCostDollars.toFixed(2)} per month at $0.35 per GB`)}
        {tile('Closing Time Tables', size(u.closingTimeBytes))}
        {tile('Files Held Here', size(u.held.bytes), `${u.held.count} files not yet in agent storage`)}
        {tile('Signing Copies Held', size(u.signing.bytes), `${u.signing.count} signing records with files`)}
        {tile('Files In Agent Storage', String(u.stored.count), 'Database copy cleared')}
        {tile('Four-Year Archive', size(u.platformArchive.bytes), `${u.platformArchive.count} closed deals kept`)}
        {tile('Deals Archived', String(u.archivedDeals), 'Closed and saved to agent storage')}
      </div>
      <p className="mt-4 text-[13px]"><a className="text-[#301D5D] underline" href="/admin/archives">Open the closed deal archive</a></p>
      <h2 className="mt-8 text-[14px] font-semibold">Largest Tables</h2>
      <table className="mt-2 w-full text-[13px]"><tbody>
        {u.tables.map((t) => <tr key={t.name} className="border-t border-[#E6E5EC]"><td className="py-2">{t.name}</td><td className="py-2 text-right">{size(t.bytes)}</td></tr>)}
      </tbody></table>
      <h2 className="mt-8 text-[14px] font-semibold">Agents Holding The Most Files</h2>
      <table className="mt-2 w-full text-[13px]"><tbody>
        {u.topAgents.length === 0 && <tr><td className="py-2 text-[#7A7787]">No agent is holding files here.</td></tr>}
        {u.topAgents.map((a) => <tr key={a.email} className="border-t border-[#E6E5EC]"><td className="py-2">{a.email}</td><td className="py-2 text-right">{a.files} files</td><td className="py-2 text-right">{size(a.bytes)}</td></tr>)}
      </tbody></table>
    </main>
  );
}
