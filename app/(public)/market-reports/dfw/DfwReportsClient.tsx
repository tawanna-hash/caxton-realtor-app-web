'use client';

// Dallas/Ft. Worth market reports, split by board:
//   Dallas    — MetroTex (DFW Metroplex + 20 counties, Denton included)
//   Ft. Worth — GFWAR (Tarrant, Parker, Johnson + Zip Detail)
// Pre-launch: /api/dfw-market-reports returns 403 unless the signed-in
// account is on the Dallas preview list.

import { useEffect, useMemo, useState } from 'react';
import DfwReportCard from '@/components/DfwReportCard';
import { DFW_BOARDS, monthLabel, type DfwBoard, type DfwMarketReport } from '@/lib/dfw-markets';

interface Payload { months: Record<DfwBoard, string | null>; reports: DfwMarketReport[] }


export default function DfwReportsClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'forbidden' | 'error'>('loading');
  const [board, setBoard] = useState<DfwBoard>('metrotex');
  const [areaKey, setAreaKey] = useState<string>('');

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

      <div role="group" aria-label="Board" className="mt-5 flex gap-2">
        {(['metrotex', 'gfwar'] as DfwBoard[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBoard(b)}
            aria-pressed={board === b}
            className={
              board === b
                ? 'flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-sm font-semibold border border-gray-900 bg-gray-900 text-white rounded-md transition-colors'
                : 'flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:text-gray-900 rounded-md transition-colors'
            }
          >
            {DFW_BOARDS[b].area} ({b === 'metrotex' ? 'MetroTex' : 'GFWAR'})
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
            <div className="mt-4 -mx-3 max-w-3xl">
              <DfwReportCard key={`${current.board}-${current.areaKey}-${current.month}`} report={current} />
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
