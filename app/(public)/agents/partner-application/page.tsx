import type { Metadata } from 'next';
import ProviderApplicationForm from './ProviderApplicationForm';

export const metadata: Metadata = {
  title: 'Join the Agent Referral Network | Realty News Now',
  description: 'Apply to connect your real estate service company with local Texas agents.',
};

export default function ProviderApplicationPage() {
  return <ProviderApplicationForm />;
}
