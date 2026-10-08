import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { query } from '@/lib/server/db/neon';

export const dynamic = 'force-dynamic';

type Row = { realtor_id: string; deal_id: string; property: string; agent_email: string; closed_at: Date; retain_until: Date | string; file_count: number; size_bytes: number };
const size = (b: number) => (b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export default async function AdminArchivesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await getCurrentAdmin().catch(() => null);
  if (!admin) redirect('/admin/login');
  const q = ((await searchParams).q ?? '').trim().slice(0, 100);
  let rows: Row[] = [];
  try {
    rows = await query<Row>(
      `SELECT realtor_id, deal_id, property, agent_email, closed_at, retain_until, file_count, size_bytes FROM closing_time_platform_archives
       WHERE ($1 = '' OR property ILIKE '%' || $1 || '%' OR agent_email ILIKE '%' || $1 || '%') ORDER BY closed_at DESC LIMIT 200`, [q]);
  } catch { rows = []; }
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 text-[#1B1726]">
      <h1 className="font-serif text-3xl text-[#301D5D]">Closing Time Archives</h1>
      <p className="mt-2 text-[14px] text-[#4A4757]">Every closed deal is kept for four years. Each download is one zip with the deal file, the audit report and the documents held here.</p>
      <form className="mt-5 flex gap-2" method="get">
        <input name="q" defaultValue={q} placeholder="Search by property or agent email" className="w-full max-w-md rounded-md border border-[#E6E5EC] px-3 py-2 text-[14px]" />
        <button type="submit" className="rounded-md border border-[#E6E5EC] bg-white px-4 py-2 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D]">Search</button>
      </form>
      <table className="mt-6 w-full text-[13px]">
        <thead><tr className="text-left text-[11px] uppercase tracking-[0.12em] text-[#7A7787]"><th className="py-2">Property</th><th>Agent</th><th>Closed</th><th>Keep Until</th><th>Files</th><th>Size</th><th /></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7} className="py-4 text-[#7A7787]">No archived deals{q ? ' match that search' : ' yet'}.</td></tr>}
          {rows.map((r) => (
            <tr key={`${r.realtor_id}-${r.deal_id}`} className="border-t border-[#E6E5EC]">
              <td className="py-2">{r.property}</td><td>{r.agent_email}</td><td>{day(r.closed_at)}</td><td>{day(r.retain_until)}</td><td>{r.file_count}</td><td>{size(r.size_bytes)}</td>
              <td className="text-right"><a className="text-[#301D5D] underline" href={`/api/admin/archives/download?realtor=${r.realtor_id}&deal=${encodeURIComponent(r.deal_id)}`}>Download</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
