// app/(public)/resources/buyer-closing-costs/page.tsx
import type { Metadata } from 'next';
import BuyerClosingCostsClient from './BuyerClosingCostsClient';

export const metadata: Metadata = {
  title: 'Buyer Closing Costs — RealtyLine Austin',
  description:
    'Estimate cash-to-close for buyers. Lender fees, title, prepaids, and escrow setup with Texas defaults.',
};

export default function BuyerClosingCostsPage() {
  return <BuyerClosingCostsClient />;
}
