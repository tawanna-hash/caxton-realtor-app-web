import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getCheckPayments } from '@/lib/server/deposit-reports';
import { DepositReport } from '../DepositReport';

export const dynamic = 'force-dynamic';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const valid = (v: string | undefined, fb: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fb);

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const one = (k: string) => { const r = p[k]; return Array.isArray(r) ? r[0] : r; };
  const now = new Date();
  const from = valid(one('from'), iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const to = valid(one('to'), iso(now));
  const admin = await getCurrentAdmin().catch(() => null);
  const payments = await getCheckPayments(from, to);
  return <DepositReport kind="detail" payments={payments} from={from} to={to} preparedBy={admin?.email ?? null} />;
}
