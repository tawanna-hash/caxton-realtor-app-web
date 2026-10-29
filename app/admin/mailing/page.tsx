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
import { ChevronRight, Mail, Users } from 'lucide-react';
import { IconSquare, MintCard, type MintTone } from '@/components/portal/Mint';
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
  const [
    countsResult,
    sourcesResult,
    realtylineResult,
    newslineResult,
    houstonResult,
    dallasResult,
  ] = await Promise.allSettled([
    countBySegment(),
    countAudienceSources(),
    countPublicationList('realtyline'),
    countPublicationList('newsline'),
    countPublicationList('realtyline-houston'),
    countPublicationList('realtyline-dallas'),
  ]);
  const emptyCounts = Object.fromEntries([
    ['total', 0],
    ...SEGMENTS.map((segment) => [segment.segment, 0] as const),
  ]) as Awaited<ReturnType<typeof countBySegment>>;
  const counts = countsResult.status === 'fulfilled' ? countsResult.value : emptyCounts;
  const sources = sourcesResult.status === 'fulfilled'
    ? sourcesResult.value
    : { aborMembers: 0, saborMembers: 0, fivePointsMembers: 0, appSubscribers: 0 };
  const publicationTotal = (
    result: PromiseSettledResult<Awaited<ReturnType<typeof countPublicationList>>>,
  ) => result.status === 'fulfilled' ? result.value.total : 0;
  const realtylineCount = publicationTotal(realtylineResult);
  const newslineCount = publicationTotal(newslineResult);
  const houstonCount = publicationTotal(houstonResult);
  const dallasCount = publicationTotal(dallasResult);

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
      accent: '#4A4757',
      initial: 'A',
    },
    {
      label: 'Five Points Board',
      href: '/admin/mailing/five-points',
      caption: 'Five Points Board of REALTORS (Williamson & Bastrop) — member roster.',
      accent: '#4A4757',
      initial: 'F',
    },
    {
      label: 'App Subscribers — RealtyLine Austin',
      href: '/admin/subscribers?market=austin',
      caption: 'RealtyLine Austin email signups from realtynewsnow.app.',
      accent: '#301D5D',
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
      accent: '#301D5D',
      initial: 'S',
    },
    {
      label: 'App Subscribers — Newsline San Antonio',
      href: '/admin/subscribers?market=san_antonio',
      caption: 'Newsline San Antonio email signups from realtynewsnow.app.',
      accent: '#301D5D',
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

  const houstonAudienceTiles: AudienceTile[] = [
    {
      label: 'App Subscribers — RealtyLine Houston',
      href: '/admin/subscribers?market=houston',
      caption: 'Houston app and email subscribers.',
      accent: '#301D5D',
      initial: 'H',
    },
  ];

  const dallasAudienceTiles: AudienceTile[] = [
    {
      label: 'App Subscribers — RealtyLine Dallas/Ft. Worth',
      href: '/admin/subscribers?market=dallas',
      caption: 'Dallas/Ft. Worth app and email subscribers.',
      accent: '#301D5D',
      initial: 'D',
    },
  ];

  const lists: Array<{ label: string; href: string; count: number }> = [
    { label: 'RealtyLine (Austin)', href: '/admin/mailing/publication/realtyline', count: realtylineCount },
    { label: 'Newsline (San Antonio)', href: '/admin/mailing/publication/newsline', count: newslineCount },
    { label: 'RealtyLine Houston', href: '/admin/mailing/publication/realtyline-houston', count: houstonCount },
    { label: 'RealtyLine Dallas/Ft. Worth', href: '/admin/mailing/publication/realtyline-dallas', count: dallasCount },
  ];

  const kpis: Array<{ label: string; value: number; sub: string }> = [
    { label: 'Segments total', value: counts.total, sub: 'all mailing segments' },
    { label: 'RealtyLine ATX Print', value: counts['realtyline-atx-print'], sub: 'partners + REALTORS' },
    { label: 'Newsline SA Print', value: counts['newsline-sa-print'], sub: 'partners + non-partners + manual' },
    { label: 'ABOR Members', value: sources.aborMembers, sub: 'UnlockMLS holding' },
    { label: 'Five Points Board', value: sources.fivePointsMembers, sub: 'RAPAMS holding' },
    { label: 'SABOR Members', value: sources.saborMembers, sub: 'RAMCO holding' },
    { label: 'App Subscribers', value: sources.appSubscribers, sub: 'email signups' },
  ];

  const austinSegments = SEGMENTS.filter((s) => anchorForSegment(s.segment) === 'abor');
  const sanAntonioSegments = SEGMENTS.filter((s) => anchorForSegment(s.segment) === 'sabor');
  const dfwSegments = SEGMENTS.filter((s) => anchorForSegment(s.segment) === 'dfw');
  const houstonSegments = SEGMENTS.filter((s) => anchorForSegment(s.segment) === 'houston');

  const TONES: MintTone[] = ['purple', 'green', 'red', 'blue'];

  const segmentCard = (title: string, note: string, segs: typeof SEGMENTS) => (
    <MintCard title={title} action={<span className="text-xs text-gray-500">{note}</span>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {segs.map((s, i) => (
          <Link
            key={s.slug}
            href={`/admin/mailing/${s.slug}`}
            className="group flex items-start gap-3 rounded-2xl border border-[#ECE8F5] bg-white p-4 transition hover:shadow-md"
          >
            <IconSquare tone={TONES[i % TONES.length]} size="lg">
              <Users className="h-5 w-5" aria-hidden />
            </IconSquare>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-gray-800">{s.label}</span>
                <span className="text-xl font-bold tabular-nums text-[#6D3FD6]">{counts[s.segment].toLocaleString()}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500">{s.caption}</p>
            </div>
          </Link>
        ))}
      </div>
    </MintCard>
  );

  const audienceList = (title: string, tiles: AudienceTile[]) => (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500">{title}</div>
      <ul>
        {tiles.map((t) => (
          <li key={t.label + t.href}>
            <Link href={t.href} className="flex items-center gap-3 rounded-xl p-2 hover:bg-[#F6F5FB]">
              <IconSquare tone="purple"><Mail className="h-4 w-4" aria-hidden /></IconSquare>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-gray-800">{t.label}</div>
                <div className="truncate text-xs text-gray-500">{t.caption}</div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="mailing-admin-page space-y-6">
      <MailingBreadcrumb trail={[{ label: 'Mailing' }]} />
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Audience</p>
        <PageTitle size="md">Mailing List HUB</PageTitle>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Every audience source in one place: segments, board mirrors, app signups, and manual entries. Active partners and their staff sync into the Partners segment automatically.
        </p>
      </div>

      {/* KPI strip */}
      <section className="grid grid-cols-2 rounded-2xl border border-[#ECE8F5] bg-white lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="border-[#E3DEF1] px-5 py-5 lg:border-l lg:border-dashed lg:first:border-l-0">
            <div className="text-sm text-gray-700">{k.label}</div>
            <div className="mt-2 text-3xl font-bold tabular-nums text-[#6D3FD6]">{k.value.toLocaleString()}</div>
            <div className="mt-1 text-xs text-gray-500">{k.sub}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {segmentCard('RealtyLine Austin', 'ABoR-anchored segments', austinSegments)}
          {segmentCard('Newsline San Antonio', 'SABOR-anchored segments', sanAntonioSegments)}
          {segmentCard('Dallas / Ft. Worth', 'MetroTex directory lists', dfwSegments)}
          {segmentCard('RealtyLine Houston', 'Greater Houston counties', houstonSegments)}
        </div>

        <div className="space-y-6">
          <MintCard title="Open email list">
            <p className="mb-3 text-xs text-gray-500">
              Merges segments, board mirrors, app subscribers and email signups, deduped by email. CSV download lives inside.
            </p>
            <ul className="space-y-2">
              {lists.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    title={`${l.count.toLocaleString()} unique deliverable emails`}
                    className="flex items-center justify-between gap-3 rounded-md border border-[#ECE8F5] px-4 py-2.5 text-sm font-medium text-[#301D5D] hover:bg-[#F6F5FB]"
                  >
                    <span>{l.label}</span>
                    <span className="rounded-md bg-[#EEE9FA] px-2.5 py-0.5 text-xs font-bold text-[#6D3FD6]">{l.count.toLocaleString()}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </MintCard>

          <MintCard title="Audience pages">
            <div className="space-y-4">
              {audienceList('RealtyLine Austin', austinAudienceTiles)}
              {audienceList('Newsline San Antonio', sanAntonioAudienceTiles)}
              {audienceList('RealtyLine Houston', houstonAudienceTiles)}
              {audienceList('RealtyLine Dallas/Ft. Worth', dallasAudienceTiles)}
            </div>
          </MintCard>

          <MintCard title="Tools">
            <div className="flex flex-wrap gap-2">
              {[
                ['Manage tags', '/admin/mailing/tags'],
                ['Bulk email verify', '/admin/mailing/bulk-verify'],
                ['Suppression list', '/admin/mailing/suppressions'],
              ].map(([label, href]) => (
                <Link key={href} href={href} className="inline-flex rounded-md border border-[#ECE8F5] px-4 py-1.5 text-xs font-semibold text-[#6D3FD6] hover:bg-[#F6F5FB]">
                  {label}
                </Link>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Deleting a contact in Mailing or Holding permanently tombstones the email so future ABOR/SABOR syncs skip it. Each segment page supports CSV, TSV and JSON import and export.
            </p>
          </MintCard>
        </div>
      </div>
    </div>
  );
}
