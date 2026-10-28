'use client';

// E-Blast and App product fields for the unified New agreement form.
// Pricing comes from lib/media-kit so it matches the quote builder.
import {
  EBLASTS, APP_AD_SLOTS, eblastPriceForPub, weeklyRateForMarkets, monthlyRateForMarkets, type MarketCount,
} from '@/lib/media-kit';
import { publicationToPubId } from '@/lib/publications';

export type ProductKind = 'print' | 'email' | 'app';
export type Scope = 'austin' | 'san_antonio' | 'both';
export type Prod = {
  packageId: string; scope: Scope; sends: number; dates: string[];
  cadence: 'weekly' | 'monthly'; weeks: number; months: number; markets: MarketCount;
};
export const eblastId = (name: string) => name.toLowerCase().replace(/\s+/g, '');
export const EMPTY_PROD: Prod = { packageId: '', scope: 'austin', sends: 1, dates: [''], cadence: 'weekly', weeks: 1, months: 1, markets: 1 };

export function prodCents(kind: ProductKind, p: Prod): number {
  if (kind === 'email') {
    const e = EBLASTS.find((x) => eblastId(x.name) === p.packageId);
    if (!e) return 0;
    return Math.round(eblastPriceForPub(e, p.scope === 'both' ? 'both' : publicationToPubId(p.scope)) * 100) * Math.max(1, p.sends);
  }
  if (kind === 'app') {
    const s = APP_AD_SLOTS.find((x) => x.slug === p.packageId);
    if (!s) return 0;
    if (p.cadence === 'weekly') return Math.round(weeklyRateForMarkets(s, p.markets) * 100) * Math.max(1, p.weeks);
    const m = monthlyRateForMarkets(s, p.markets);
    return m == null ? 0 : Math.round(m * 100) * Math.max(1, p.months);
  }
  return 0;
}

export function prodLines(kind: ProductKind, p: Prod): Array<[string, string]> {
  if (kind === 'email') {
    const e = EBLASTS.find((x) => eblastId(x.name) === p.packageId);
    return [['Product', `E-Blast${e ? ` · ${e.name}` : ''}`], ['Sends', String(p.sends)], ['Audience', p.scope === 'both' ? 'Both publications' : p.scope === 'austin' ? 'RealtyLine Austin' : 'Newsline San Antonio'], ...(p.dates.filter(Boolean).length ? [['Preferred dates', p.dates.filter(Boolean).join(', ')] as [string, string]] : [])];
  }
  if (kind === 'app') {
    const s = APP_AD_SLOTS.find((x) => x.slug === p.packageId);
    return [['Product', `App${s ? ` · ${s.name}` : ''}`], ['Run', p.cadence === 'weekly' ? `${p.weeks} week(s)` : `${p.months} month(s)`], ['Markets', String(p.markets)]];
  }
  return [];
}

function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block text-xs text-gray-600">{t}<div className="mt-1">{children}</div></label>;
}
const IN = 'w-full rounded-md border border-gray-300 px-2 py-2 text-sm';
export default function ProductFields({ kind, value, onChange }: { kind: 'email' | 'app'; value: Prod; onChange: (p: Prod) => void }) {
  const set = (patch: Partial<Prod>) => onChange({ ...value, ...patch });
  if (kind === 'email') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <L t="E-Blast package *"><select className={IN} value={value.packageId} onChange={(e) => set({ packageId: e.target.value })}>
          <option value="">Select a package</option>
          {EBLASTS.map((e) => <option key={e.name} value={eblastId(e.name)}>{e.name}</option>)}
        </select></L>
        <L t="Audience"><select className={IN} value={value.scope} onChange={(e) => set({ scope: e.target.value as Scope })}>
          <option value="austin">RealtyLine Austin</option><option value="san_antonio">Newsline San Antonio</option><option value="both">Both publications</option>
        </select></L>
        <L t="Number of sends"><input type="number" min={1} max={24} className={IN} value={value.sends} onChange={(e) => set({ sends: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })} /></L>
        <L t="Preferred send date"><input type="date" className={IN} value={value.dates[0] ?? ''} onChange={(e) => set({ dates: [e.target.value, ...value.dates.slice(1)] })} /></L>
      </div>
    );
  }
  const slot = APP_AD_SLOTS.find((s) => s.slug === value.packageId);
  const monthlyOk = !!slot && monthlyRateForMarkets(slot, value.markets) != null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <L t="App placement *"><select className={IN} value={value.packageId} onChange={(e) => set({ packageId: e.target.value, cadence: 'weekly' })}>
        <option value="">Select a placement</option>
        {APP_AD_SLOTS.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
      </select></L>
      <L t="Markets"><select className={IN} value={value.markets} onChange={(e) => set({ markets: Number(e.target.value) as MarketCount })}>
        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
      </select></L>
      <L t="Billing cadence"><select className={IN} value={value.cadence} onChange={(e) => set({ cadence: e.target.value as 'weekly' | 'monthly' })}>
        <option value="weekly">Weekly</option>{monthlyOk && <option value="monthly">Monthly</option>}
      </select></L>
      {value.cadence === 'weekly'
        ? <L t="Weeks"><input type="number" min={1} max={52} className={IN} value={value.weeks} onChange={(e) => set({ weeks: Math.max(1, Math.min(52, Number(e.target.value) || 1)) })} /></L>
        : <L t="Months"><input type="number" min={1} max={24} className={IN} value={value.months} onChange={(e) => set({ months: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })} /></L>}
    </div>
  );
}
