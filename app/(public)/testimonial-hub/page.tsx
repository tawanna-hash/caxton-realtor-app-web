import ContractsShell from '../contracts/ContractsShell';
import TestimonialHubClient from './TestimonialHubClient';

export const metadata = {
  title: 'Testimonials Hub | Closing Time (limited edition)',
  description: 'Collect, organize, and publish client testimonials.',
};

export default function TestimonialHubPage() {
  return (
    <ContractsShell active="testimonials">
      <TestimonialHubClient eyebrow="Closing Time (limited edition)" />
    </ContractsShell>
  );
}
