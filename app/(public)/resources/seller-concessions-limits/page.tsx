// app/(public)/resources/seller-concessions-limits/page.tsx
import type { Metadata } from 'next';
import SellerConcessionsLimitsClient from './SellerConcessionsLimitsClient';

export const metadata: Metadata = {
  title: "Seller's Concessions Limits — RealtyLine Austin",
  description:
    'Maximum interested-party contribution caps by loan program. Conventional (LTV-banded), FHA, VA, and USDA, with a dollar-amount calculator.',
};

export default function SellerConcessionsLimitsPage() {
  return <SellerConcessionsLimitsClient />;
}
