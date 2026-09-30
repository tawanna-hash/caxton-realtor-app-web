'use client';

// Dallas/Ft. Worth market reports, split by board:
//   Dallas    — MetroTex (DFW Metroplex + 20 counties, Denton included)
//   Ft. Worth — GFWAR (Tarrant, Parker, Johnson + Zip Detail)
// Pre-launch: /api/dfw-market-reports returns 403 unless the signed-in
// account is on the Dallas preview list.

import { useEffect, useMemo, useState } from 'react';
import { DFW_BOARDS, monthLabel, type DfwBoard, type DfwMarketReport, type DfwMetrics } from '@/lib/dfw-markets';

interface Payload { months: Record<DfwBoard, string | null>; reports: DfwMarketReport[] }

const BRAND = '#301D5D';

function Stat({ label, value, delta, note }: { label: string; value?: string | null; delta?: string | null; note?: string | null }) {
  if (!value) return null;
  const neg = delta?.trim().startsWith('-');
  const flat = delta ? /^[+-]?0(\.0+)?%$/.test(delta.trim()) : false;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</div>
      {delta ? (
        <div className={`mt-1 text-sm tabular-nums ${flat ? 'text-gray-600' : neg ? 'text-red-700' : 'text-green-700'}`}>
          {flat ? '' : neg ? '▼ ' : '▲ '}
          {delta.replace(/^[+-]/, '')} vs. last year
        </div>
      ) : null}
      {note ? <div className="mt-1 text-sm text-gray-600">{note}</div> : null}
    </div>
  );
}

function Metrics({ m, board }: { m: DfwMetrics; board: DfwBoard }) {
  return (
    <div className="grid grid-cols-2 content-start items-start gap-3 self-start md:grid-cols-3">
      <Stat label="Median price" value={m.medianPrice} delta={m.medianPriceYoY} />
      <Stat label="Closed sales" value={m.closedSales} delta={m.closedSalesYoY} />
      <Stat label="Active listings" value={m.activeListings} delta={m.activeListingsYoY} />
      <Stat
        label="Months of inventory"
        value={m.monthsInventory}
        note={m.monthsInventoryPrior ? `${m.monthsInventoryPrior} a year ago` : null}
      />
      <Stat
        label="Days on market"
        value={m.daysOnMarket}
        note={
          board === 'metrotex'
            ? [m.daysToClose ? `${m.daysToClose} days to close` : null, m.daysTotal ? `${m.daysTotal} total` : null]
                .filter(Boolean)
                .join(' · ') || m.daysNote || null
            : null
        }
      />
      {board === 'metrotex' ? (
        <Stat label="Top price range share" value={m.marketSharePct} note={m.marketShareBand} />
      ) : (
        <>
          <Stat label="Average price" value={m.averagePrice} delta={m.averagePriceYoY} />
          <Stat label="Price per sq. ft." value={m.pricePerSqft} delta={m.pricePerSqftYoY} />
          <Stat label="New listings" value={m.newListings} />
          <Stat label="Pending sales" value={m.pendingSales} />
          <Stat label="Close to original list" value={m.closeToListPrice} />
          <Stat label="Dollar volume" value={m.dollarVolume} delta={m.dollarVolumeYoY} />
        </>
      )}
    </div>
  );
}

export default function DfwReportsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [board, setBoard] = useState<DfwBoard>('metrotex');
  const [areaKey, setAreaKey] = useState<string>('');
  const [spanish, setSpanish] = useState(false);

  useEffect(() => {
    fetch('/api/dfw-market-reports', { credentials: 'include', cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) return setState('forbidden');
        if (!r.ok) return setState('error');
        setData((await r.json()) as Payload);
        setState('ok');
      })
      .catch(() => setState('error'));
  }, []);

  const areas = useMemo(() => (data?.reports ?? []).filter((r) => r.board === board), [data, board]);
  const regions = areas.filter((a) => a.areaType === 'region');
  const counties = areas.filter((a) => a.areaType === 'county');
  const zips = areas.filter((a) => a.areaType === 'zip').sort((a, b) => a.areaKey.localeCompare(b.areaKey));

  const current =
    areas.find((a) => a.areaKey === areaKey) ?? regions[0] ?? counties[0] ?? zips[0] ?? null;
  const info = DFW_BOARDS[board];

  if (state === 'forbidden') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Dallas/Ft. Worth market reports</h1>
        <p className="mt-2 text-gray-600">This market is coming soon.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Dallas/Ft. Worth Market Reports (Preview)</h1>
      <p className="mt-1 text-sm text-gray-600">Monthly housing numbers by board, county and zip code.</p>

      <div role="group" aria-label="Board" className="mt-5 inline-flex rounded-full border border-gray-200 p-1 text-sm">
        {(['metrotex', 'gfwar'] as DfwBoard[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => {
              setBoard(b);
              setSpanish(false);
            }}
            aria-pressed={board === b}
            className={`rounded-full px-4 py-1.5 ${board === b ? 'text-white' : 'text-gray-700'}`}
            style={board === b ? { backgroundColor: BRAND } : undefined}
          >
            {DFW_BOARDS[b].area}
          </button>
        ))}
      </div>

      {state === 'loading' ? (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : state === 'error' ? (
        <p className="mt-6 text-gray-600">Reports could not be loaded. Please try again.</p>
      ) : areas.length === 0 ? (
        <p className="mt-6 text-gray-600">No {info.area} reports have been imported yet.</p>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="text-sm text-gray-700">
              <span className="mb-1 block font-medium">Area</span>
              <select
                value={current?.areaKey ?? ''}
                onChange={(e) => setAreaKey(e.target.value)}
                className="min-w-[14rem] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                {regions.length > 0 && (
                  <optgroup label="Region">
                    {regions.map((a) => <option key={a.areaKey} value={a.areaKey}>{a.areaLabel}</option>)}
                  </optgroup>
                )}
                {counties.length > 0 && (
                  <optgroup label="Counties">
                    {counties.map((a) => <option key={a.areaKey} value={a.areaKey}>{a.areaLabel}</option>)}
                  </optgroup>
                )}
                {zips.length > 0 && (
                  <optgroup label="Zip codes">
                    {zips.map((a) => <option key={a.areaKey} value={a.areaKey}>{a.areaLabel}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            {current ? <div className="pb-2 text-sm text-gray-600">{monthLabel(current.month)}</div> : null}
          </div>

          {current ? (
            <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_22rem]">
              <Metrics m={current.metrics} board={board} />
              {current.imageUrl ? (
                <figure className="lg:sticky lg:top-20 lg:self-start">
                  {current.imageUrlEs ? (
                    <div className="mb-2 inline-flex rounded-full border border-gray-200 p-0.5 text-xs">
                      {[false, true].map((es) => (
                        <button
                          key={String(es)}
                          type="button"
                          onClick={() => setSpanish(es)}
                          aria-pressed={spanish === es}
                          className={`rounded-full px-3 py-1 ${spanish === es ? 'text-white' : 'text-gray-700'}`}
                          style={spanish === es ? { backgroundColor: BRAND } : undefined}
                        >
                          {es ? 'Español' : 'English'}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={(spanish && current.imageUrlEs) || current.imageUrl}
                    alt={`${current.areaLabel} housing report, ${monthLabel(current.month)}`}
                    className="mx-auto h-auto max-h-[calc(100vh-11rem)] w-auto max-w-full rounded-xl border border-gray-200 object-contain"
                    loading="lazy"
                  />
                </figure>
              ) : null}
            </div>
          ) : null}

          <p className="mt-6 text-xs text-gray-500">
            Source:{' '}
            <a href={current?.sourceUrl || info.source} target="_blank" rel="noopener noreferrer" className="underline">
              {info.label}
            </a>
            . Data produced by the Texas Real Estate Research Center at Texas A&amp;M University.
          </p>
        </>
      )}
    </main>
  );
}
