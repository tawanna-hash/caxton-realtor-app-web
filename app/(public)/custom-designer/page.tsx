import DesignerClient from './DesignerClient';

export const metadata = {
  title: 'Custom Designer | Realty News Now',
  description: 'Create email signatures, flyers, social graphics, and business cards.',
};

export const dynamic = 'force-dynamic';

export default function CustomDesignerPage() {
  return <DesignerClient />;
}
