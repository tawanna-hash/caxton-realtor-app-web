import type { Metadata } from 'next';
import ResourcesClient from '../ResourcesClient';

export const metadata: Metadata = {
  title: 'REALTOR® Downloadable Guides — Realty News Now',
  description: 'Downloadable checklists, workbooks, and field guides for REALTORS®.',
};

export default function DownloadableGuidesPage() {
  return <ResourcesClient view="guides" />;
}
