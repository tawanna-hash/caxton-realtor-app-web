'use client';

// app/(public)/resources/1031-exchange/Exchange1031Client.tsx
//
// IRC §1031 like-kind exchange timeline helper.
// Inputs: relinquished property closing date.
// Output: status banner with 180-day progress, key deadlines, milestone list.

import { useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import {
  computeExchangeTimeline,
  type ExchangeTimeline,
  type ExchangeMilestone,
} from '@/lib/realtor-calc-math';
import { DateField } from '../_components/CalcInputs';
import ResourceFloater from '../_components/ResourceFloater';
import { reportTimestamp, type CalcReport } from '../_components/calcPdf';

const EYEBROW = 'text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDateLong(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtDays(d: number): string {
  if (d === 0) return 'today';
  if (d === 1) return 'in 1 day';
  if (d === -1) return '1 day ago';
  if (d > 0) return `in ${d} days`;
  return `${Math.abs(d)} days ago`;
}

export default function Exchange1031Client() {
  const [relinquishedClosing, setRelinquishedClosing] = useState<string>(todayIso());

  const timeline: ExchangeTimeline = useMemo(
    () => computeExchangeTimeline(relinquishedClosing),
    [relinquishedClosing]
  );

  const statusTone = statusToneFor(timeline.statusLabel);
  const idMissed = timeline.daysUntilId < 0;
  const exchangeMissed = timeline.daysUntilExchange < 0;

  const buildReport = (): CalcReport => ({
    title: '1031 Exchange Timeline',
    subtitle: `Relinquished closing · ${fmtDateLong(relinquishedClosing)}`,
    heroLabel: 'Status',
    heroValue: timeline.statusLabel,
    meta: [
      { key: 'Generated', value: reportTimestamp() },
      { key: '45-day deadline', value: fmtDateLong(timeline.identificationDeadline) },
      { key: '180-day deadline', value: fmtDateLong(timeline.exchangeDeadline) },
      { key: 'Progress', value: `${Math.round(timeline.progress * 100)}%` },
    ],
    sections: [
      {
        heading: 'Key deadlines',
        rows: [
          {
            label: '45-day identification deadline',
            value: `${fmtDateLong(timeline.identificationDeadline)} (${fmtDays(timeline.daysUntilId)})`,
            emphasis: true,
            negative: idMissed,
          },
          {
            label: '180-day exchange deadline',
            value: `${fmtDateLong(timeline.exchangeDeadline)} (${fmtDays(timeline.daysUntilExchange)})`,
            emphasis: true,
            negative: exchangeMissed,
          },
        ],
      },
      {
        heading: 'Milestones',
        rows: timeline.milestones.map((m) => ({
          label: `Day ${m.daysFromStart} — ${m.label}${m.isDeadline ? ' (IRS)' : ''}`,
          value: `${fmtDateLong(m.date)} · ${fmtDays(m.daysFromToday)}`,
          emphasis: m.isDeadline,
        })),
      },
      {
        heading: 'Identification rules (pick one)',
        rows: [
          { label: '3-property rule', value: 'Up to 3 of any value' },
          { label: '200% rule', value: 'Any number — total FMV ≤ 200% of sale' },
          { label: '95% rule', value: 'Any number — must close on 95%+ of FMV' },
        ],
      },
    ],
    disclaimer:
      'Not tax or legal advice. 1031 exchanges have strict identification, related-party, and reporting rules (IRS Form 8824). Engage a qualified intermediary BEFORE closing the relinquished property and confirm timing with a CPA — the 180-day window is reduced if the tax return (incl. extensions) is due sooner.',
    filename: `1031-timeline-${relinquishedClosing}`,
  });

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16 pb-32 print:pb-12">
      <header className="mb-10 print:mb-4">
        <p className={EYEBROW}>REALTOR® Tool</p>
        <PageTitle>1031 Exchange Timeline</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4 print:hidden">
          Track the two non-negotiable IRS deadlines on a like-kind exchange:
          the 45-day identification period and the 180-day replacement period.
          Both clocks start the day the relinquished property closes — and
          neither is extended for weekends or holidays.
        </p>
      </header>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* ── Inputs ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6 print:hidden">
          <FieldGroup title="Relinquished property">
            <DateField
              label="Closing date (Day 0)"
              value={relinquishedClosing}
              onChange={setRelinquishedClosing}
              hint="Date the sale of the relinquished property closed"
            />
          </FieldGroup>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-900 mb-2">
              Before Day 0
            </p>
            <p className="text-sm text-amber-900 leading-relaxed">
              The exchanger must have a written exchange agreement in place
              with a <strong>qualified intermediary (QI)</strong> before
              closing. Proceeds CANNOT touch the seller&apos;s hands or the
              exchange is disqualified.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-800 mb-2">
              Identification rules (pick one)
            </p>
            <ul className="text-sm text-gray-700 leading-relaxed space-y-1.5 list-disc list-inside marker:text-gray-400">
              <li><strong>3-property rule</strong> — identify up to 3 of any value.</li>
              <li><strong>200% rule</strong> — identify any number, total FMV ≤ 200% of relinquished sale price.</li>
              <li><strong>95% rule</strong> — identify any number, must close on 95%+ of total FMV.</li>
            </ul>
          </div>
        </div>

        {/* ── Result / Timeline ───────────────────────────────────── */}
        <div className="lg:col-span-3 print:col-span-5 space-y-6">
          {/* Status banner */}
          <div className={`rounded-xl border ${statusTone.border} ${statusTone.bg} p-5`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className={`text-[10px] uppercase tracking-wider font-semibold ${statusTone.label}`}>
                  Status
                </p>
                <p
                  className={`text-2xl ${statusTone.text}`}
                  style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
                >
                  {timeline.statusLabel}
                </p>
              </div>
            </div>

            {/* Progress bar — 180 day window */}
            <div className="mb-2">
              <div className="relative h-3 rounded-full bg-white/60 overflow-hidden border border-gray-200">
                <div
                  className="absolute inset-y-0 left-0 bg-[#1a2a44]"
                  style={{ width: `${timeline.progress * 100}%` }}
                />
                {/* 45-day marker — 45/180 = 25% */}
                <div
                  className="absolute inset-y-0 w-px bg-rose-500"
                  style={{ left: '25%' }}
                  title="Day 45"
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>Day 0</span>
                <span className="text-rose-700 font-medium" style={{ marginLeft: '12%' }}>Day 45</span>
                <span>Day 180</span>
              </div>
            </div>

            {/* Two deadline cards */}
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <DeadlineCard
                label="45-day ID deadline"
                date={timeline.identificationDeadline}
                days={timeline.daysUntilId}
                missed={idMissed}
              />
              <DeadlineCard
                label="180-day exchange deadline"
                date={timeline.exchangeDeadline}
                days={timeline.daysUntilExchange}
                missed={exchangeMissed}
              />
            </div>
          </div>

          {/* Milestone list */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
            <p className={EYEBROW}>Milestones</p>
            <ol className="mt-3 space-y-4">
              {timeline.milestones.map((m, idx) => (
                <MilestoneRow key={idx} milestone={m} />
              ))}
            </ol>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-12 leading-relaxed print:hidden">
        <strong>Not tax or legal advice.</strong> 1031 exchanges have strict
        identification rules, related-party limitations, and reporting
        requirements (IRS Form 8824). Engage a qualified intermediary{' '}
        <em>before</em> closing the relinquished property, and confirm timing
        with a CPA — the 180-day window is reduced if your tax return is due
        sooner (incl. extensions).
      </p>

      <ResourceFloater
        shareTitle="1031 Exchange Timeline — RealtyLine Austin"
        shareText="Track the 45-day identification and 180-day replacement deadlines on a like-kind exchange."
        buildReport={buildReport}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#1a2a44] mb-3">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function DeadlineCard({
  label,
  date,
  days,
  missed,
}: {
  label: string;
  date: string;
  days: number;
  missed: boolean;
}) {
  const upcoming = !missed;
  return (
    <div
      className={`rounded-lg border px-3 py-3 ${
        missed
          ? 'border-rose-200 bg-rose-50'
          : 'border-white bg-white/70'
      }`}
    >
      <p className={`text-[10px] uppercase tracking-wider font-semibold ${missed ? 'text-rose-800' : 'text-gray-600'}`}>
        {label}
      </p>
      <p
        className={`text-base ${missed ? 'text-rose-800' : 'text-gray-900'}`}
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
      >
        {fmtDateLong(date)}
      </p>
      <p className={`text-xs mt-0.5 ${missed ? 'text-rose-700' : upcoming ? 'text-gray-700' : 'text-gray-500'}`}>
        {missed ? `passed ${fmtDays(days)}` : fmtDays(days)}
      </p>
    </div>
  );
}

function MilestoneRow({ milestone }: { milestone: ExchangeMilestone }) {
  const past = milestone.daysFromToday < 0;
  const today = milestone.daysFromToday === 0;
  const deadline = milestone.isDeadline;

  const dotColor = deadline ? 'bg-rose-600' : past ? 'bg-gray-400' : 'bg-[#1a2a44]';
  const labelColor = deadline ? 'text-rose-800' : 'text-gray-900';
  const badgeBg = deadline
    ? 'bg-rose-100 text-rose-800 border-rose-200'
    : 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <li className="relative pl-7">
      <span
        className={`absolute left-0 top-1.5 h-3 w-3 rounded-full ${dotColor} ${today ? 'ring-4 ring-[#c4a35a]/30' : ''}`}
        aria-hidden
      />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`text-sm font-semibold ${labelColor}`}>
          Day {milestone.daysFromStart} — {milestone.label}
        </span>
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeBg}`}>
          {deadline ? 'IRS deadline' : 'Recommended'}
        </span>
      </div>
      <div className="text-xs text-gray-500 mt-0.5">
        {fmtDateLong(milestone.date)} · <span className={past ? 'text-gray-500' : 'text-gray-700'}>{fmtDays(milestone.daysFromToday)}</span>
      </div>
      <p className="text-sm text-gray-700 mt-1 leading-relaxed">
        {milestone.description}
      </p>
    </li>
  );
}

function statusToneFor(status: string) {
  switch (status) {
    case 'Pre-closing':
      return {
        border: 'border-gray-200',
        bg: 'bg-gray-50',
        label: 'text-gray-600',
        text: 'text-gray-900',
      };
    case 'Identification period':
      return {
        border: 'border-amber-200',
        bg: 'bg-amber-50',
        label: 'text-amber-800',
        text: 'text-amber-900',
      };
    case 'Exchange period':
      return {
        border: 'border-[#c4a35a]/40',
        bg: 'bg-[#c4a35a]/5',
        label: 'text-[#1a2a44]',
        text: 'text-[#1a2a44]',
      };
    case 'Expired':
      return {
        border: 'border-rose-200',
        bg: 'bg-rose-50',
        label: 'text-rose-800',
        text: 'text-rose-900',
      };
    default:
      return {
        border: 'border-gray-200',
        bg: 'bg-gray-50',
        label: 'text-gray-600',
        text: 'text-gray-900',
      };
  }
}
