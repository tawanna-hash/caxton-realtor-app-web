// app/(public)/resources/mortgage-calculator/page.tsx
//
// Public mortgage calculator page — designed for realtors/brokers
// to use during showings, buyer consults, or share with clients.

import type { Metadata } from 'next';
import MortgageCalculatorClient from './MortgageCalculatorClient';

export const metadata: Metadata = {
  title: 'Mortgage Calculator — RealtyLine Austin',
  description:
    'Realtor-grade mortgage calculator with PITI breakdown, amortization schedule, and affordability analysis. For Austin-area REALTORS® and brokers.',
};

export default function MortgageCalculatorPage() {
  return <MortgageCalculatorClient />;
}
