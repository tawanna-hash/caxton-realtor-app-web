import DesignerClient from './DesignerClient';

export const metadata = {
  title: 'Custom Designer | Realty News Now',
  description: 'Create email signatures, flyers, social graphics, and business cards.',
};

// Pure client-side tool shell — no data fetch, no cookies/session reads,
// no searchParams. Nothing here ever changes at request time, so this can
// cache for a long time.
export const revalidate = 86400; // 1 day

export default function CustomDesignerPage() {
  return <DesignerClient />;
}
