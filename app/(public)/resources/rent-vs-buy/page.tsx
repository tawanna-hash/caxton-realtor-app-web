// app/(public)/resources/rent-vs-buy/page.tsx
import type { Metadata } from 'next';
import RentVsBuyClient from './RentVsBuyClient';

export const metadata: Metadata = {
  title: 'Rent vs. Buy — RealtyLine Austin',
  description:
    'Compare the cost of renting vs. buying over time. Finds the breakeven year accounting for appreciation, equity, and selling costs.',
};

export default function RentVsBuyPage() {
  return <RentVsBuyClient />;
}
