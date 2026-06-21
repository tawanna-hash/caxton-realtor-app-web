// app/admin/mailing/page.tsx
//
// Mailing List HUB — KPI strip + tiles for each segment + tiles for every
// Audience page (ABOR, SABOR, App Subscribers, Manual Subscribe).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { anchorForSegment, countAudienceSources, countBySegment, SEGMENTS } from '@/lib/mailing';
import { countPublicationList } from '@/lib/server/mailing/publication-counts';

import PageTitle from '@/components/ui/PageTitle';
import MailingBreadcrumb from '@/components/admin/MailingBreadcrumb';
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
  // Headline KPIs come from two sources:
  //  - countBySegment(): all stage='mailing' segment counts.
  //  - countAudienceSources(): ABoR (unlockmls), SABOR (ramco-sabor),
  //    and app subscribers (realtors table). These match what each
  //    dedicated page reports, so the HUB tiles agree with their
  //    destination pages.
  const [counts, sources, realtylineCount, newslineCount] = await Promise.all([
    countBySegment(),
    countAudienceSources(),
    countPublicationList('realtyline'),
    countPublicationList('newsline'),
  ]);

  // Accents: each tile uses a distinct palette hue so they remain visually
  // distinguishable while staying in the 4-color lockdown.
  //
  // Audience pages are split by publication so each sub-section above has
  // its own board mirror + app-signups + manual-subscribe entry.
  const austinAudienceTiles: AudienceTile[] = [
    {
      label: 'ABOR Members',
      href: '/admin/mailing/holding',
      caption: 'Austin Board of REALTORS — staging & review queue.',
      accent: '#6b7280',
      initial: 'A',
    },
    {
      label: 'App Subscribers — RealtyLine Austin',
      href: '/admin/subscribers?market=austin',
      caption: 'RealtyLine Austin newsletter signups from realtynewsnow.app.',
      accent: '#ea580c',
      initial: 'A',
    },
    {
      label: 'Manual Subscribe',
      href: '/subscribe',
      caption: 'Add a RealtyLine Austin subscriber by hand (public form).',
      accent: '#301D5D',
      initial: 'M',
    },
  ];

  const sanAntonioAudienceTiles: AudienceTile[] = [
    {
      label: 'SABOR Members',
      href: '/admin/mailing/sabor-members',
      caption: 'San Antonio Board of REALTORS mirror.',
      accent: '#2563eb',
      initial: 'S',
    },
    {
      label: 'App Subscribers — Newsline San Antonio',
      href: '/admin/subscribers?market=san_antonio',
      caption: 'Newsline San Antonio newsletter signups from realtynewsnow.app.',
      accent: '#ea580c',
      initial: 'N',
    },
    {
      label: 'Manual Subscribe',
      href: '/subscribe',
      caption: 'Add a Newsline San Antonio subscriber by hand (public form).',
      accent: '#301D5D',
      initial: 'M',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <MailingBreadcrumb trail={[{ label: 'Mailing' }]} />
      {/* Header */}
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Audience
        </p>
        <PageTitle size="md">Mailing List HUB</PageTitle>
        <p className="mt-2 text-sm text-gray-600 max-w-2xl">
          Every audience source in one place — segments, board mirrors, app
          signups, and manual entries. Active advertisers and their staff sync
          into the Advertisers segment automatically.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium">
            Open email list
          </span>
          <Link
            href="/admin/mailing/publication/realtyline"
            className="group/dl inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#301D5D] text-[#301D5D] text-xs font-semibold hover:bg-[#301D5D] hover:text-white transition"
          >
            <span>RealtyLine (Austin)</span>
            <span
              className="inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#301D5D]/10 text-[#301D5D] group-hover/dl:bg-white/20 group-hover/dl:text-white"
              title={`${realtylineCount.total.toLocaleString()} unique deliverable emails`}
            >
              {realtylineCount.total.toLocaleString()}
            </span>
          </Link>
          <Link
            href="/admin/mailing/publication/newsline"
            className="group/dl inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#1d4ed8] text-[#1d4ed8] text-xs font-semibold hover:bg-[#1d4ed8] hover:text-white transition"
          >
            <span>Newsline (San Antonio)</span>
            <span
              className="inline-flex items-center justify-center min-w-[2.25rem] px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#1d4ed8]/10 text-[#1d4ed8] group-hover/dl:bg-white/20 group-hover/dl:text-white"
              title={`${newslineCount.total.toLocaleString()} unique deliverable emails`}
            >
              {newslineCount.total.toLocaleString()}
            </span>
          </Link>
          <span className="text-xs text-gray-500">
            Merges segments + board mirrors + app subscribers + newsletter signups, deduped by email. CSV download lives inside.
          </span>
        </div>
        <div className="mt-3 text-xs text-gray-500">
          Deleting a contact in Mailing or Holding now permanently tombstones the email so future ABOR/SABOR syncs skip it.{' '}
          <Link href="/admin/mailing/suppressions" className="font-semibold text-[#301D5D] hover:underline">
            View suppression list →
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3">
        <KpiCard label="Segments total"      value={counts.total}                       sub="all mailing segments" />
        <KpiCard label="Manual Newsline San Antonio"     value={counts['manual-newsline']}          sub="manual entries"      accent="#301D5D" />
        <KpiCard label="REALTORS"            value={counts.realtor}                     sub="licensed agents"     accent="#5a0e5f" />
        <KpiCard label="ABOR Members"        value={sources.aborMembers}                sub="UnlockMLS holding"   accent="#6b7280" />
        <KpiCard label="SABOR Members"       value={sources.saborMembers}               sub="RAMCO holding"       accent="#1d4ed8" />
        <KpiCard label="App Subscribers"     value={sources.appSubscribers}             sub="newsletter signups"  accent="#2563eb" />
        <KpiCard label="Active — ATX"        value={counts['active-advertiser-atx']}    sub="RealtyLine ATX"      accent="#301D5D" />
        <KpiCard label="Active — SA"         value={counts['active-advertiser-sa']}     sub="Newsline San Antonio"         accent="#3b82f6" />
        <KpiCard label="Non-Advertisers — ATX" value={counts['non-advertiser-atx']}     sub="RealtyLine ATX"      accent="#f97316" />
        <KpiCard label="Non-Advertisers — SA"  value={counts['non-advertiser-sa']}      sub="Newsline San Antonio"         accent="#ea580c" />
      </div>

      {/* Segment tiles — split by publication */}
      {(() => {
        // RealtyLine Austin = ABoR-anchored segments (ATX advertisers,
        // ATX non-advertisers, and the Texas-wide REALTORS list which is
        // Austin-centric). Newsline San Antonio = SABOR-anchored segments
        // (manual Newsline contacts, SA advertisers, SA non-advertisers).
        const austinSegments  = SEGMENTS.filter((s) => anchorForSegment(s.segment) === 'abor');
        const sanAntonioSegments = SEGMENTS.filter((s) => anchorForSegment(s.segment) === 'sabor');

        const renderTile = (s: typeof SEGMENTS[number]) => {
          const c = counts[s.segment];
          return (
            <Link
              key={s.slug}
              href={`/admin/mailing/${s.slug}`}
              className="group block rounded-md border border-gray-200 bg-white p-5 hover:shadow-sm transition"
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
        };

        return (
          <div className="space-y-8">
            <div>
              <div className="flex items-baseline gap-3 mb-3">
                <h2 className="font-serif text-xl text-gray-900">RealtyLine Austin</h2>
                <span className="text-xs uppercase tracking-[0.15em] text-gray-500">ABoR-anchored segments</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {austinSegments.map(renderTile)}
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-3 mb-3">
                <h2 className="font-serif text-xl text-gray-900">Newsline San Antonio</h2>
                <span className="text-xs uppercase tracking-[0.15em] text-gray-500">SABOR-anchored segments</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sanAntonioSegments.map(renderTile)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Audience pages — split by publication so each section above has
          its own board mirror + app signups + manual-subscribe entry. */}
      {(() => {
        const renderAudienceTile = (t: AudienceTile) => (
          <Link
            key={t.href}
            href={t.href}
            className="group block rounded-md border border-gray-200 bg-white p-5 hover:shadow-sm transition"
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
        );
        return (
          <div className="space-y-8">
            <div>
              <div className="flex items-baseline gap-3 mb-3">
                <h2 className="font-serif text-xl text-gray-900">RealtyLine Austin audience pages</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {austinAudienceTiles.map(renderAudienceTile)}
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-3 mb-3">
                <h2 className="font-serif text-xl text-gray-900">Newsline San Antonio audience pages</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sanAntonioAudienceTiles.map(renderAudienceTile)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Footer hint */}
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-6 py-6 text-center">
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
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div
        className="h-7 w-7 rounded-md mb-3"
        style={{ backgroundColor: accent ? `${accent}15` : '#f3f4f6' }}
      />
      <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
      <div className="mt-1">
        <div className="text-xs font-semibold text-gray-900">{label}</div>
        <div className="text-[11px] text-gray-500">{sub}</div>
      </div>
    </div>
  );
}
