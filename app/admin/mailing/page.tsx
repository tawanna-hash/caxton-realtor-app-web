// app/admin/mailing/page.tsx
//
// Mailing List HUB — KPI strip + tiles for each segment + tiles for every
// Audience page (ABOR, SABOR, App Subscribers, Five Points Board, Manual Subscribe).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { countBySegment, countHolding, SEGMENTS } from '@/lib/mailing';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

type AudienceTile = {
  label: string;
  href: string;
  caption: string;
  accent: string;
  initial: string;
};

export default async function MailingHubPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();
  const counts = await countBySegment();
  const holding = await countHolding();

  const audienceTiles: AudienceTile[] = [
    {
      label: 'ABOR Members',
      href: '/admin/mailing/holding',
      caption: 'Austin Board of REALTORS — staging & review queue.',
      accent: '#6B7280',
      initial: 'A',
    },
    {
      label: 'SABOR Members',
      href: '/admin/mailing/sabor-members',
      caption: 'San Antonio Board of REALTORS mirror.',
      accent: '#0EA5E9',
      initial: 'S',
    },
    {
      label: 'App Subscribers',
      href: '/admin/subscribers',
      caption: 'Newsletter signups from realtynewsnow.app.',
      accent: '#10B981',
      initial: 'N',
    },
    {
      label: 'Five Points Board',
      href: '/admin/five-points-board',
      caption: 'Five Points board members — coming soon.',
      accent: '#F59E0B',
      initial: '5',
    },
    {
      label: 'Manual Subscribe',
      href: '/subscribe',
      caption: 'Add a subscriber by hand (public form).',
      accent: '#3D0740',
      initial: 'M',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Audience
        </p>
        <h1 className="font-serif text-3xl text-gray-900">Mailing List HUB</h1>
        <p className="mt-2 text-sm text-gray-600 max-w-2xl">
          Every audience source in one place — segments, board mirrors, app
          signups, and manual entries. Active advertisers and their staff sync
          into the Advertisers segment automatically.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
        <KpiCard label="Total subscribers"   value={counts.total}                       sub="all segments" />
        <KpiCard label="Manual Newsline"     value={counts['manual-newsline']}          sub="manual entries"  accent="#10B981" />
        <KpiCard label="REALTORS"            value={counts.realtor}                     sub="licensed agents" accent="#3D0740" />
        <KpiCard label="ABOR Members"        value={holding.total}                      sub="awaiting review" accent="#6B7280" />
        <KpiCard label="Active — ATX"        value={counts['active-advertiser-atx']}    sub="RealtyLine ATX"  accent="#2563EB" />
        <KpiCard label="Active — SA"         value={counts['active-advertiser-sa']}     sub="Newsline SA"     accent="#0EA5E9" />
        <KpiCard label="Non-Advertisers — ATX" value={counts['non-advertiser-atx']}     sub="RealtyLine ATX"  accent="#F59E0B" />
        <KpiCard label="Non-Advertisers — SA"  value={counts['non-advertiser-sa']}      sub="Newsline SA"     accent="#EA580C" />
      </div>

      {/* Segment tiles */}
      <div>
        <h2 className="font-serif text-xl text-gray-900 mb-3">Segments</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SEGMENTS.map((s) => {
            const c = counts[s.segment];
            return (
              <Link
                key={s.slug}
                href={`/admin/mailing/${s.slug}`}
                className="group block rounded-lg border border-gray-200 bg-white p-5 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="h-10 w-10 rounded-md flex items-center justify-center text-sm font-semibold"
                    style={{ backgroundColor: `${s.accent}15`, color: s.accent }}
                  >
                    {s.label.charAt(0)}
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${s.accent}15`, color: s.accent }}
                  >
                    {c.toLocaleString()}
                  </span>
                </div>
                <div className="font-serif text-lg text-gray-900">{s.label}</div>
                <p className="mt-1 text-sm text-gray-600">{s.caption}</p>
                <div className="mt-3 text-xs font-medium text-gray-700 group-hover:text-gray-900">
                  Open list
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Audience pages — every page under Audience nav, surfaced as a tile here */}
      <div>
        <h2 className="font-serif text-xl text-gray-900 mb-3">Audience pages</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {audienceTiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group block rounded-lg border border-gray-200 bg-white p-5 hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="h-10 w-10 rounded-md flex items-center justify-center text-sm font-semibold"
                  style={{ backgroundColor: `${t.accent}15`, color: t.accent }}
                >
                  {t.initial}
                </div>
              </div>
              <div className="font-serif text-lg text-gray-900">{t.label}</div>
              <p className="mt-1 text-sm text-gray-600">{t.caption}</p>
              <div className="mt-3 text-xs font-medium text-gray-700 group-hover:text-gray-900">
                Open page
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Footer hint */}
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-6 text-center">
        <h3 className="font-serif text-lg text-gray-900 mb-1">
          Import and export from every segment
        </h3>
        <p className="text-sm text-gray-600 max-w-xl mx-auto">
          Each segment page supports CSV / TSV / JSON import and export with
          auto-mapped column headers and sortable columns.
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, sub, accent,
}: { label: string; value: number; sub: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div
        className="h-7 w-7 rounded-md mb-3"
        style={{ backgroundColor: accent ? `${accent}15` : '#F3F4F6' }}
      />
      <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
      <div className="mt-1">
        <div className="text-xs font-semibold text-gray-900">{label}</div>
        <div className="text-[11px] text-gray-500">{sub}</div>
      </div>
    </div>
  );
}
