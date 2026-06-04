// app/(public)/resources/title-rate-calculator/page.tsx
import type { Metadata } from 'next';
import TitleRateCalculatorClient from './TitleRateCalculatorClient';

export const metadata: Metadata = {
  title: 'Texas Title Rate Calculator — RealtyLine Austin',
  description:
    "Promulgated Texas title insurance premium estimator. Owner's and Lender's policies, R-5 simultaneous issue, R-8 refinance reissue credit, and common endorsements.",
};

export default function TitleRateCalculatorPage() {
  return <TitleRateCalculatorClient />;
}
