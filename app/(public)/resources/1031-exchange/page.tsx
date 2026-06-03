// app/(public)/resources/1031-exchange/page.tsx
import type { Metadata } from 'next';
import Exchange1031Client from './Exchange1031Client';

export const metadata: Metadata = {
  title: '1031 Exchange Timeline — RealtyLine Austin',
  description:
    'Track the IRS §1031 like-kind exchange deadlines — 45-day identification and 180-day replacement — from the relinquished property closing date.',
};

export default function Exchange1031Page() {
  return <Exchange1031Client />;
}
