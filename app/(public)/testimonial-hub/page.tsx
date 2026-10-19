import ContractsNav from '../contracts/ContractsNav';
import TestimonialHubClient from './TestimonialHubClient';

export const metadata = {
  title: 'Testimonial Hub | Closing Time (limited edition)',
  description: 'Collect, organize, and publish client testimonials.',
};

export default function TestimonialHubPage() {
  return (
    <>
      <ContractsNav active="testimonials" />
      <TestimonialHubClient />
    </>
  );
}
