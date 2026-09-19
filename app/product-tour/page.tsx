import type { Metadata } from 'next';
import ProductTourClient from './ProductTourClient';

export const metadata: Metadata = {
  title: { absolute: 'Interactive Product Tour | Realty News Now' },
  description:
    'Take a guided tour of Realty News Now, the Texas real estate news and professional tools app.',
  alternates: { canonical: '/product-tour' },
  openGraph: {
    title: 'Explore Realty News Now',
    description:
      'See the news, events, inventory, publications, partners, and REALTOR® tools available in one app.',
    url: '/product-tour',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Explore Realty News Now',
    description:
      'A guided look at the app built for Texas real estate professionals.',
  },
};

export default function ProductTourPage() {
  return <ProductTourClient />;
}
