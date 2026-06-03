// app/(public)/resources/investment-property/page.tsx
import type { Metadata } from 'next';
import InvestmentPropertyClient from './InvestmentPropertyClient';

export const metadata: Metadata = {
  title: 'Investment Property ROI — RealtyLine Austin',
  description:
    'Cash flow, cap rate, cash-on-cash return, NOI, DSCR, and the 1%/50% rule of thumb checks for single-family and small multifamily rentals.',
};

export default function InvestmentPropertyPage() {
  return <InvestmentPropertyClient />;
}
