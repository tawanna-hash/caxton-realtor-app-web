// app/(public)/resources/commission-calculator/page.tsx
import type { Metadata } from 'next';
import CommissionCalculatorClient from './CommissionCalculatorClient';

export const metadata: Metadata = {
  title: 'Commission Calculator — RealtyLine Austin',
  description:
    'Breaks total commission down by side, broker split, referral, and flat fee. Realtor take-home in seconds.',
};

export default function CommissionCalculatorPage() {
  return <CommissionCalculatorClient />;
}
