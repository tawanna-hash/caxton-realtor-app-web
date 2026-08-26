import TestimonialSubmissionClient from './TestimonialSubmissionClient';

export const metadata = {
  title: 'Share a testimonial | Realty News Now',
  description: 'Share feedback about your real estate experience.',
};

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export default async function TestimonialSubmissionPage({ params }: Ctx) {
  const { token } = await params;
  return <TestimonialSubmissionClient token={token} />;
}
