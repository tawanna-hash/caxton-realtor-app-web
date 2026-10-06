'use client';

/**
 * Admin: Dallas/Ft. Worth market reports (MetroTex = Dallas, GFWAR = Ft. Worth).
 *
 * The board graphic / PDF is the data source: "Fill from graphic" reads the
 * MetroTex infographic for the chosen area + month (or an uploaded graphic)
 * into the fields below, and a GFWAR PDF upload parses every area page. The
 * admin reviews and saves; saved rows are marked edited so the daily import
 * never overwrites them. Readers see the numbers only, never the graphic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import PageTitle from '@/components/ui/PageTitle';
import {
  DFW_BOARDS,
  GFWAR_COUNTIES,
  METROTEX_COUNTIES,
  countyKey,
  monthLabel,
  type DfwAreaType,
  type DfwBoard,
  type DfwMarketReport,
  type DfwMetrics,
} from '@/lib/dfw-markets';

type Row = DfwMarketReport & { adminEdited?: boolean };
type Field = { key: keyof DfwMetrics; label: string };

const METROTEX_FIELDS: Field[] = [
  { key: 'medianPrice', label: 'Median price' },
  { key: 'medianPriceYoY', label: 'Median price YoY %' },
  { key: 'marketSharePct', label: 'Market share %' },
  { key: 'marketShareBand', label: 'Market share price range' },
  { key: 'activeListings', label: 'Active listings' },
  { key: 'activeListingsYoY', label: 'Active listings YoY %' },
  { key: 'closedSales', label: 'Closed sales' },
  { key: 'closedSalesYoY', label: 'Closed sales YoY %' },
  { key: 'daysOnMarket', label: 'Days on market' },
  { key: 'daysToClose', label: 'Days to close' },
  { key: 'daysTotal', label: 'Total days' },
  { key: 'daysNote', label: 'Days note' },
  { key: 'monthsInventory', label: 'Months of inventory' },
  { key: 'monthsInventoryPrior', label: 'Months of inventory, a year ago' },
];

const GFWAR_FIELDS: Field[] = [
  { key: 'closedSales', label: 'Closed sales' },
  { key: 'closedSalesYoY', label: 'Closed sales YoY %' },
  { key: 'dollarVolume', label: 'Dollar volume' },
  { key: 'dollarVolumeYoY', label: 'Dollar volume YoY %' },
  { key: 'averagePrice', label: 'Average price' },
  { key: 'averagePriceYoY', label: 'Average price YoY %' },
  { key: 'medianPrice', label: 'Median price' },
  { key: 'medianPriceYoY', label: 'Median price YoY %' },
  { key: 'pricePerSqft', label: 'Price per sq. ft.' },
  { key: 'pricePerSqftYoY', label: 'Price per sq. ft. YoY %' },
  { key: 'daysOnMarket', label: 'Days on market' },
  { key: 'newListings', label: 'New listings' },
  { key: 'activeListings', label: 'Active listings' },
  { key: 'pendingSales', label: 'Pending sales' },
  { key: 'monthsInventory', label: 'Months of inventory' },
  { key: 'closeToListPrice', label: 'Close to original list %' },
];

interface AreaOpt { areaType: DfwAreaType; areaKey: string; areaLabel: string }

function baseAreas(board: DfwBoard): AreaOpt[] {
  if (board === 'metrotex') {
    return [
      { areaType: 'region', areaKey: 'dfw-metroplex', areaLabel: 'DFW Metroplex' },
      ...METROTEX_COUNTIES.map((c) => ({ areaType: 'county' as const, areaKey: countyKey(c), areaLabel: `${c} County` })),
    ];
  }
  return GFWAR_COUNTIES.map((c) => ({ areaType: 'county' as const, areaKey: countyKey(c), areaLabel: `${c} County` }));
}

function lastMonths(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';
const btnCls = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50';
const primaryCls = 'rounded-md bg-[#301D5D] px-4 py-2 text-sm font-medium text-white hover:bg-[#241646] disabled:opacity-50';

export default function DfwReportAdminPage() {
  const { admin, loading: authLoading } = useAdmin();
  const [board, setBoard] = useState<DfwBoard>('metrotex');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState<string>(lastMonths(1)[0]);
  const [areaKey, setAreaKey] = useState<string>('dfw-metroplex');
  const [metrics, setMetrics] = useState<DfwMetrics>({});
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUrlEs, setImageUrlEs] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [parsed, setParsed] = useState<DfwMarketReport[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (b: DfwBoard) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/dfw-market-reports?board=${b}`, { credentials: 'include', cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.reports ?? []);
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Failed to load' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    fetch(`/api/admin/dfw-market-reports?board=${board}`, { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        setRows(json.ok ? json.reports ?? [] : []);
        setLoading(false);
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [admin, board]);

  const areas = useMemo(() => {
    const list = baseAreas(board);
    const seen = new Set(list.map((a) => a.areaKey));
    for (const r of rows) {
      if (!seen.has(r.areaKey)) {
        seen.add(r.areaKey);
        list.push({ areaType: r.areaType, areaKey: r.areaKey, areaLabel: r.areaLabel });
      }
    }
    return list;
  }, [board, rows]);

  const months = useMemo(() => {
    const set = new Set([...lastMonths(6), ...rows.map((r) => r.month)]);
    return [...set].sort().reverse();
  }, [rows]);

  const area = areas.find((a) => a.areaKey === areaKey) ?? areas[0];
  const stored = rows.find((r) => r.areaKey === area?.areaKey && r.month === month) ?? null;
  const fields = board === 'metrotex' ? METROTEX_FIELDS : GFWAR_FIELDS;

  // Load the stored values whenever the selection changes.
  const selKey = `${board}|${area?.areaKey}|${month}|${stored?.updatedAt ?? ''}`;
  const [loadedKey, setLoadedKey] = useState('');
  if (loadedKey !== selKey) {
    setLoadedKey(selKey);
    setMetrics(stored?.metrics ?? {});
    setImageUrl(stored?.imageUrl ?? null);
    setImageUrlEs(stored?.imageUrlEs ?? null);
  }

  function switchBoard(b: DfwBoard) {
    setBoard(b);
    setLoading(true);
    setAreaKey(baseAreas(b)[0].areaKey);
    setParsed(null);
    setMsg(null);
  }

  async function fillFromMetroTex() {
    if (!area) return;
    setBusy('fill');
    setMsg(null);
    try {
      const res = await fetch('/api/admin/dfw-market-reports/import-graphic', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaKey: area.areaKey, month }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Could not read graphic');
      setMetrics((m) => ({ ...m, ...json.metrics }));
      setImageUrl(json.imageUrl ?? null);
      setImageUrlEs(json.imageUrlEs ?? null);
      setMsg({ tone: 'ok', text: 'Fields filled from the MetroTex graphic. Review, then save.' });
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not read graphic' });
    } finally {
      setBusy(null);
    }
  }

  async function onUpload(file: File) {
    setBusy('upload');
    setMsg(null);
    setParsed(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/dfw-market-reports/import-graphic', { method: 'POST', credentials: 'include', body: fd });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Could not read file');
      if (Array.isArray(json.reports)) {
        const reps = (json.reports as DfwMarketReport[]).map((r) => ({ ...r, board }));
        if (reps.length === 1) {
          const r = reps[0];
          setMonth(r.month);
          setAreaKey(r.areaKey);
          setLoadedKey(`${board}|${r.areaKey}|${r.month}|__upload`);
          setMetrics(r.metrics);
          setMsg({ tone: 'ok', text: `Read ${r.areaLabel}, ${monthLabel(r.month)}. Review, then save.` });
        } else {
          setParsed(reps);
          setMsg({ tone: 'ok', text: `Read ${reps.length} areas from the PDF. Save them all below, or pick one to review.` });
        }
      } else {
        setMetrics((m) => ({ ...m, ...json.metrics }));
        setMsg({ tone: 'ok', text: 'Fields filled from the uploaded graphic. Review, then save.' });
      }
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not read file' });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save(list: DfwMarketReport[]) {
    setBusy('save');
    setMsg(null);
    try {
      const res = await fetch('/api/admin/dfw-market-reports', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reports: list }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Save failed');
      setMsg({ tone: 'ok', text: `Saved ${json.saved} report${json.saved === 1 ? '' : 's'}.` });
      setParsed(null);
      await load(board);
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setBusy(null);
    }
  }

  function saveCurrent() {
    if (!area) return;
    void save([{
      board, areaType: area.areaType, areaKey: area.areaKey, areaLabel: area.areaLabel, month, metrics,
      sourceUrl: stored?.sourceUrl ?? DFW_BOARDS[board].source, imageUrl, imageUrlEs,
    }]);
  }

  if (authLoading) return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  if (!admin) return null;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageTitle>DFW Market Reports</PageTitle>
      <p className="mt-1 text-sm text-gray-600">
        Dallas = MetroTex (DFW Metroplex + 20 counties, Denton included). Ft. Worth = GFWAR (Tarrant, Parker, Johnson + zip codes).
        Private preview — readers only see the numbers at /market-reports/dfw.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Board" className="inline-flex rounded-full border border-gray-200 p-1 text-sm">
          {(['metrotex', 'gfwar'] as DfwBoard[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => switchBoard(b)}
              aria-pressed={board === b}
              className={`rounded-full px-4 py-1.5 ${board === b ? 'bg-[#301D5D] text-white' : 'text-gray-700'}`}
            >
              {DFW_BOARDS[b].area} ({b === 'metrotex' ? 'MetroTex' : 'GFWAR'})
            </button>
          ))}
        </div>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Month</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-gray-700">Area</span>
          <select value={area?.areaKey ?? ''} onChange={(e) => setAreaKey(e.target.value)} className={`${inputCls} min-w-[14rem]`}>
            {areas.map((a) => {
              const has = rows.some((r) => r.areaKey === a.areaKey && r.month === month);
              return <option key={a.areaKey} value={a.areaKey}>{a.areaLabel}{has ? '' : ' — empty'}</option>;
            })}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {board === 'metrotex' && (
          <button type="button" className={btnCls} onClick={fillFromMetroTex} disabled={!!busy}>
            {busy === 'fill' ? 'Reading graphic…' : 'Fill from MetroTex graphic'}
          </button>
        )}
        <button type="button" className={btnCls} onClick={() => fileRef.current?.click()} disabled={!!busy}>
          {busy === 'upload' ? 'Reading file…' : board === 'metrotex' ? 'Upload graphic' : 'Upload GFWAR PDF'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={board === 'metrotex' ? 'image/png,image/jpeg,image/webp' : 'application/pdf,image/png,image/jpeg,image/webp'}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); }}
        />
      </div>

      {msg && (
        <div className={`mt-3 rounded-md px-3 py-2 text-sm ${msg.tone === 'ok' ? 'bg-[#E0FBE0] text-[#005A00]' : 'bg-[#FFEAE6] text-[#661102]'}`}>
          {msg.text}
        </div>
      )}

      {parsed && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <span>
            {parsed.length} areas · {[...new Set(parsed.map((r) => monthLabel(r.month)))].join(', ')}
          </span>
          <button type="button" className={primaryCls} onClick={() => void save(parsed)} disabled={!!busy}>
            {busy === 'save' ? 'Saving…' : `Save all ${parsed.length}`}
          </button>
          <button type="button" className={btnCls} onClick={() => setParsed(null)}>Discard</button>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="mb-3 text-sm text-gray-600">
            {loading ? 'Loading…' : stored
              ? `Saved ${stored.updatedAt ? new Date(stored.updatedAt).toLocaleString() : ''}${stored.adminEdited ? ' · edited by admin (daily import won’t overwrite)' : ' · from daily import'}`
              : 'No saved values for this area and month yet.'}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.key} className="text-sm">
                <span className="mb-1 block font-medium text-gray-700">{f.label}</span>
                <input
                  className={inputCls}
                  value={metrics[f.key] ?? ''}
                  onChange={(e) => setMetrics((m) => ({ ...m, [f.key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="mt-5">
            <button type="button" className={primaryCls} onClick={saveCurrent} disabled={!!busy || !area}>
              {busy === 'save' ? 'Saving…' : 'Save report'}
            </button>
          </div>
        </div>

        <aside>
          <div className="mb-2 text-sm font-medium text-gray-700">Source graphic</div>
          {imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={`${area?.areaLabel ?? ''} source graphic`} className="w-full rounded-lg border border-gray-200" />
              <div className="mt-2 flex gap-3 text-xs">
                <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="underline">English</a>
                {imageUrlEs && <a href={imageUrlEs} target="_blank" rel="noopener noreferrer" className="underline">Spanish</a>}
              </div>
            </>
          ) : stored?.sourceUrl ? (
            <a href={stored.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">Open source report</a>
          ) : (
            <p className="text-sm text-gray-500">None yet.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
