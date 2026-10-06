// app/admin/_components/EmailBadge.tsx
//
// Tiny presentational pill used across every admin list view that
// shows an email column. Pairs with the unified email_verifications
// table — pass the row's status (or null for unverified rows).
//
// Status mapping:
//   valid   → green       ✓ Valid
//   invalid → red         ✗ Invalid
//   risky   → amber       △ Risky      (catch-all / managed-mail / role)
//   unknown → blue        ? Unknown    (verifier timed out / no MX answer)
//   pending → gray        … Pending
//   null    → light gray  — Unverified (no row in email_verifications yet)
//
// The component intentionally has no click handler — the "verify now"
// button lives in the existing VerifyCell on Mailing/Holding/Sabor
// pages. On Subscribers/Newsletter we just surface the badge.

'use client';

import type { ReactNode } from 'react';

export type EmailBadgeStatus = 'valid' | 'invalid' | 'risky' | 'unknown' | 'pending' | null | undefined;

interface Props {
  status: EmailBadgeStatus;
  /** Optional tooltip (e.g. the verifier's `sub_status` reason). */
  title?: string;
  /** When true, render a slightly larger pill (default false = xs). */
  size?: 'xs' | 'sm';
  /** Extra className appended to the pill. */
  className?: string;
}

interface BadgeStyle {
  bg: string;
  fg: string;
  border: string;
  icon: ReactNode;
  label: string;
}

function styleFor(status: EmailBadgeStatus): BadgeStyle {
  switch (status) {
    case 'valid':
      return {
        bg: 'bg-[#E0FBE0]', fg: 'text-[#005A00]', border: 'border-[#00E200]/30',
        icon: <span aria-hidden>✓</span>, label: 'Valid',
      };
    case 'invalid':
      return {
        bg: 'bg-[#FFEAE6]', fg: 'text-[#661102]', border: 'border-[#FF2A04]/30',
        icon: <span aria-hidden>✗</span>, label: 'Invalid',
      };
    case 'risky':
      return {
        bg: 'bg-[#FEF8CC]', fg: 'text-[#645600]', border: 'border-[#FAD800]/30',
        icon: <span aria-hidden>△</span>, label: 'Risky',
      };
    case 'unknown':
      return {
        bg: 'bg-[#E3F7FF]', fg: 'text-[#285766]', border: 'border-[#64D9FF]/30',
        icon: <span aria-hidden>?</span>, label: 'Unknown',
      };
    case 'pending':
      return {
        bg: 'bg-slate-100', fg: 'text-slate-600', border: 'border-slate-200',
        icon: <span aria-hidden>…</span>, label: 'Pending',
      };
    default:
      return {
        bg: 'bg-gray-50', fg: 'text-gray-500', border: 'border-gray-200',
        icon: <span aria-hidden>—</span>, label: 'Unverified',
      };
  }
}

export default function EmailBadge({ status, title, size = 'xs', className = '' }: Props) {
  const s = styleFor(status);
  const sz = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5';
  return (
    <span
      title={title || s.label}
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${sz} ${s.bg} ${s.fg} ${s.border} ${className}`}
    >
      <span className="leading-none">{s.icon}</span>
      <span>{s.label}</span>
    </span>
  );
}
