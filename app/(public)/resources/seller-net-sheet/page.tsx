// app/(public)/resources/seller-net-sheet/page.tsx
import type { Metadata } from 'next';
import SellerNetSheetClient from './SellerNetSheetClient';

export const metadata: Metadata = {
  title: 'Seller Net Sheet — RealtyLine Austin',
  description:
    'Estimate seller net proceeds. Title, escrow, commissions, tax proration, payoff — all in one printable view.',
};

export default function SellerNetSheetPage() {
  return <SellerNetSheetClient />;
}
