'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Play, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import PageTitle from '@/components/ui/PageTitle';
import MoveInReadyGuideContent from '@/components/admin/guides/MoveInReadyGuideContent';
import CommunityGuideContent from '@/components/admin/guides/CommunityGuideContent';
import PromotionGuideContent from '@/components/admin/guides/PromotionGuideContent';

// ─────────────────────────────────────────────────────────────────────────
// Static metadata: all scrapers, grouped by category.
// Cron schedules are from vercel.json (UTC). CDT = UTC-5.
// ─────────────────────────────────────────────────────────────────────────

export type ScraperRunRow = {
  scraperPath: string;
  lastRunAt: string;
  durationMs: number;
  status: 'ok' | 'error' | 'skipped';
  rowCount: number;
  rawCount: number;
  created: number;
  updated: number;
  deactivated: number;
  errorMessage: string | null;
};

type Scraper = {
  name: string;
  path: string;
  schedule: string;      // human-readable CDT
  description: string;
  external?: boolean;    // runs off-Vercel (Perplexity scheduled task etc.)
};

type ScraperGroup = {
  label: string;
  scrapers: Scraper[];
};

const GROUPS: ScraperGroup[] = [
  {
    label: 'External Ingest',
    scrapers: [
      { name: 'The Hollows at Lake Travis', path: 'scrape-hollows', schedule: '3:45 PM CDT (Perplexity)', description: 'QMI homes — Cloudflare-gated, runs off-Vercel', external: true },
    ],
  },
  {
    label: 'Builders & Developers — Move-in Ready',
    scrapers: [
      { name: 'KB Home',            path: 'scrape-kb-home',             schedule: '11:15 AM CDT', description: 'Move-in ready homes' },
      { name: 'David Weekley',      path: 'scrape-david-weekley',       schedule: '12:00 PM CDT', description: 'Move-in ready homes' },
      { name: 'Drees',              path: 'scrape-drees',               schedule: '10:45 AM CDT', description: 'Move-in ready homes' },
      { name: 'M/I Homes',         path: 'scrape-mi-homes',            schedule: '10:00 AM CDT', description: 'Move-in ready homes' },
      { name: 'Santa Rita Ranch',   path: 'scrape-santa-rita-ranch',   schedule: '2:15 PM CDT',  description: 'Showcase homes (Pipsy API)' },
      { name: 'La Cima',           path: 'scrape-la-cima',            schedule: '2:45 PM CDT',  description: 'Move-in ready homes' },
      { name: 'Newmark',           path: 'scrape-newmark',             schedule: '3:30 PM CDT',  description: 'Move-in ready homes' },
      { name: 'Brookfield',        path: 'scrape-brookfield-residential', schedule: '3:00 PM CDT', description: 'Move-in ready homes' },
    ],
  },
  {
    label: 'Builders & Developers — Communities',
    scrapers: [
      { name: 'KB Home',            path: 'scrape-kb-home-communities',          schedule: '11:00 AM CDT', description: 'Community pages' },
      { name: 'David Weekley',      path: 'scrape-david-weekley-communities',   schedule: '11:30 AM CDT', description: 'Community pages' },
      { name: 'M/I Homes',         path: 'scrape-mi-homes-communities',         schedule: '10:30 AM CDT', description: 'Community pages' },
      { name: 'Santa Rita Ranch',   path: 'scrape-santa-rita-ranch-communities', schedule: '1:45 PM CDT', description: 'Neighborhood communities' },
      { name: 'Newmark',           path: 'scrape-newmark-communities',           schedule: '3:15 PM CDT', description: 'Community pages' },
      { name: 'Brookfield',        path: 'scrape-brookfield-residential-communities', schedule: '3:15 PM CDT', description: 'Community pages' },
      { name: 'Giddens',           path: 'scrape-giddens-communities',           schedule: '1:30 PM CDT', description: 'Community pages' },
    ],
  },
  {
    label: 'Builders & Developers — Promotions',
    scrapers: [
      { name: 'KB Home',            path: 'scrape-kb-home-promotions',          schedule: '11:30 AM CDT', description: 'Builder promotions' },
      { name: 'David Weekley',      path: 'scrape-david-weekley-promotions',   schedule: '11:45 AM CDT', description: 'Builder promotions' },
      { name: 'Drees',              path: 'scrape-drees-promotions',            schedule: '10:15 AM CDT', description: 'Builder promotions' },
      { name: 'M/I Homes',         path: 'scrape-mi-homes-incentives',         schedule: '9:00 AM CDT',  description: 'Builder incentives' },
      { name: 'Santa Rita Ranch',   path: 'scrape-santa-rita-ranch-promotions', schedule: '2:30 PM CDT', description: 'Builder promotions' },
      { name: 'La Cima',           path: 'scrape-la-cima-promotions',           schedule: '3:00 PM CDT', description: 'Builder promotions' },
    ],
  },
  {
    label: 'MLS & Realtor Data',
    scrapers: [
      { name: 'UnlockMLS',         path: 'scrape-unlockmls',    schedule: '6:00 AM CDT',  description: 'MLS listings data' },
      { name: 'SABOR',             path: 'scrape-sabor',         schedule: '8:30 AM CDT',  description: 'San Antonio MLS' },
      { name: 'SA Builders',       path: 'scrape-sabuilders',    schedule: '8:45 AM CDT',  description: 'San Antonio builders list' },
      { name: 'ABoR Realtors',     path: 'scrape-abor-realtors', schedule: '10:00 PM CDT', description: 'Austin realtor roster' },
      { name: 'Giddens Realtors',  path: 'scrape-giddens-realtors', schedule: '2:00 PM CDT', description: 'Realtor sync' },
    ],
  },
  {
    label: 'Industry & Associations',
    scrapers: [
      { name: 'FPR',       path: 'scrape-fpr',   schedule: '7:00 AM CDT', description: 'Floor plan registry' },
      { name: 'HBA',       path: 'scrape-hba',   schedule: '8:00 AM CDT', description: 'Home Builders Assoc.' },
      { name: 'TMB',       path: 'scrape-tmbsa', schedule: '9:15 AM CDT', description: 'Texas builders' },
      { name: 'NAHREP',    path: 'scrape-nahrep', schedule: '9:30 AM CDT', description: 'Hispanic real estate assoc.' },
    ],
  },
];


type RunState = Record<string, { status: 'idle' | 'running' | 'success' | 'error'; result?: string }>;

type Tab = 'scrapers' | 'movein-guide' | 'community-guide' | 'promotion-guide';

const TABS: { id: Tab; label: string }[] = [
  { id: 'scrapers',          label: 'Scrapers' },
  { id: 'movein-guide',      label: 'Move-in Ready Homes Guide' },
  { id: 'community-guide',   label: 'Community Guide' },
  { id: 'promotion-guide',   label: 'Promotion Guide' },
];

export default function ScraperHubClient({ initialRuns }: { initialRuns: ScraperRunRow[] }) {
  const runMap = new Map<string, ScraperRunRow>(initialRuns.map((r) => [r.scraperPath, r]));
  const [runState, setRunState] = useState<RunState>({});
  const [tab, setTab] = useState<Tab>('scrapers');

  const runScraper = useCallback(async (path: string) => {
    setRunState((prev) => ({ ...prev, [path]: { status: 'running' } }));
    try {
      // Hit the admin-only proxy — the bearer is injected server-side
      // by /api/admin/scrapers/run. The browser must never see CRON_SECRET.
      const res = await fetch('/api/admin/scrapers/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      const summary = [
        data.upserted != null && `${data.upserted} upserted`,
        data.created != null && `${data.created} created`,
        data.updated != null && `${data.updated} updated`,
        data.rawCount != null && `${data.rawCount} raw`,
        data.deactivated != null && `${data.deactivated} deactivated`,
        data.stripped != null && `${data.stripped} stripped`,
      ].filter(Boolean).join(' · ') || 'OK';
      setRunState((prev) => ({ ...prev, [path]: { status: 'success', result: summary } }));
    } catch (e) {
      setRunState((prev) => ({
        ...prev,
        [path]: { status: 'error', result: e instanceof Error ? e.message : 'Failed' },
      }));
    }
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-1">
            Content
          </p>
          <PageTitle size="md">Scraper Hub</PageTitle>
          <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
            Run any scraper on demand and reference the build guides. Schedules shown in CDT; crons run daily on Vercel.
          </p>
        </div>
        <Link
          href="/admin/inventory"
          className="shrink-0 border border-brand-700 text-brand-700 px-4 py-2 text-sm font-medium hover:bg-brand-50 rounded-md transition-colors whitespace-nowrap self-start"
        >
          ← Back to Inventory
        </Link>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-brand-700 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'scrapers' && (
        <div className="space-y-8">
          {GROUPS.map((group) => (
            <section key={group.label}>
              <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold mb-3">
                {group.label}
              </h2>
              <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Scraper</th>
                      <th className="px-4 py-2.5 font-medium">Description</th>
                      <th className="px-4 py-2.5 font-medium whitespace-nowrap">Schedule (CDT)</th>
                      <th className="px-4 py-2.5 font-medium text-right w-32">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.scrapers.map((s) => {
                      const st = runState[s.path];
                      const status = st?.status ?? 'idle';
                      return (
                        <tr key={s.path} className="border-t border-gray-100">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-gray-900">{s.name}</div>
                            <button
                              onClick={() => navigator.clipboard.writeText(`/api/cron/${s.path}`)}
                              className="text-xs text-gray-400 hover:text-gray-600"
                              title="Copy cron path"
                            >
                              /api/cron/{s.path}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">
                            <div>{s.description}</div>
                            {(() => {
                              const r = runMap.get(s.path);
                              if (!r) return null;
                              const when = new Date(r.lastRunAt);
                              const ago = Math.floor((Date.now() - when.getTime()) / 60000);
                              const agoText = ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.floor(ago/60)}h ago` : `${Math.floor(ago/1440)}d ago`;
                              const badgeColor = r.status === 'ok' ? 'text-green-700 bg-green-50' : r.status === 'error' ? 'text-red-700 bg-red-50' : 'text-amber-700 bg-amber-50';
                              return (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  <span className={`inline-block px-1.5 py-0.5 rounded ${badgeColor} font-medium mr-1.5`}>{r.status}</span>
                                  {r.rowCount} rows · {agoText}
                                  {r.errorMessage && <div className="text-red-600 mt-0.5">{r.errorMessage}</div>}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{s.schedule}</td>
                          <td className="px-4 py-2.5 text-right">
                            {s.external ? (
                              <span className="text-xs text-gray-400">external</span>
                            ) : (
                              <button
                                type="button"
                              onClick={() => runScraper(s.path)}
                              disabled={status === 'running'}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50 ${
                                status === 'success'
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : status === 'error'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {status === 'running' ? (
                                <><Loader2 size={13} className="animate-spin" /> Running…</>
                              ) : status === 'success' ? (
                                <><CheckCircle2 size={13} /> {st.result}</>
                              ) : status === 'error' ? (
                                <><XCircle size={13} /> Failed</>
                              ) : (
                                <><Play size={13} /> Run now</>
                              )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {group.scrapers.some((s) => runState[s.path]?.status === 'error' && runState[s.path]?.result) && (
                <div className="mt-1 px-4 py-2 text-xs text-red-600">
                  {group.scrapers
                    .filter((s) => runState[s.path]?.status === 'error')
                    .map((s) => `${s.name}: ${runState[s.path]?.result}`)
                    .join('; ')}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {tab === 'movein-guide' && (
        <div className="bg-white border border-gray-200 rounded-md p-6 md:p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Move-in Ready Homes Guide</h1>
          <MoveInReadyGuideContent />
        </div>
      )}

      {tab === 'community-guide' && (
        <div className="bg-white border border-gray-200 rounded-md p-6 md:p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Community Scraper Build Guide</h1>
          <CommunityGuideContent />
        </div>
      )}

      {tab === 'promotion-guide' && (
        <div className="bg-white border border-gray-200 rounded-md p-6 md:p-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Promotion Scraper Build Guide</h1>
          <PromotionGuideContent />
        </div>
      )}
    </div>
  );
}
