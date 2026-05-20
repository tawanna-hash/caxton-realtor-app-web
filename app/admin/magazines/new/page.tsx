// app/admin/magazines/new/page.tsx
//
// Server wrapper for the new-magazine upload form.

import MagazineUploadForm from './MagazineUploadForm';

export const metadata = { title: 'Admin · New Magazine Issue' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return <MagazineUploadForm />;
}
