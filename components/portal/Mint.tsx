// components/portal/Mint.tsx
// Shared Mint-kit building blocks for the partner portal (server-safe).

import Link from 'next/link';
import type { ReactNode } from 'react';

export type MintTone = 'purple' | 'green' | 'red' | 'blue';

const TONES: Record<MintTone, { square: string; bar: string; track: string }> = {
  purple: { square: 'bg-[#E4DBFA] text-[#5B3FC4]', bar: 'bg-[#6D3FD6]', track: 'bg-[#E4DBFA]' },
  green: { square: 'bg-[#DDF8D3] text-[#2F8F1F]', bar: 'bg-[#4F46E5]', track: 'bg-[#DCDDF8]' },
  red: { square: 'bg-[#FFE0DD] text-[#D9342B]', bar: 'bg-[#EF4444]', track: 'bg-[#FADBD8]' },
  blue: { square: 'bg-[#D8F3FB] text-[#0E8FB5]', bar: 'bg-[#22B8E0]', track: 'bg-[#D8F3FB]' },
};

export function IconSquare({ tone = 'purple', children, size = 'md' }: { tone?: MintTone; children: ReactNode; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-9 w-9 rounded-xl';
  return <span className={`inline-flex shrink-0 items-center justify-center ${dim} ${TONES[tone].square}`}>{children}</span>;
}

export function StatTile({
  label,
  value,
  sub,
  icon,
  tone = 'purple',
  ratio,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  tone?: MintTone;
  ratio?: number | null;
  href?: string;
}) {
  const body = (
    <div className="h-full rounded-2xl border border-[#ECE8F5] bg-white p-5 transition hover:shadow-md">
      <div className="flex items-center gap-3">
        <IconSquare tone={tone}>{icon}</IconSquare>
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <div className="mt-4 text-4xl font-bold leading-none text-gray-800">{value}</div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
      {ratio != null && (
        <div className={`mt-4 h-1.5 w-full overflow-hidden rounded-full ${TONES[tone].track}`}>
          <div className={`h-full rounded-full ${TONES[tone].bar}`} style={{ width: `${Math.max(4, Math.min(100, Math.round(ratio * 100)))}%` }} />
        </div>
      )}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function MintCard({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[#ECE8F5] bg-white p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="!text-lg !font-normal !text-gray-800">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
