// caxton-monitored-fb-pages-v1
// Admin UI: curate the list of Facebook Pages we *follow* (don't admin) so
// /api/cron/scan-followed-fb-pages knows what to scan via headless Chromium.

import { Suspense } from 'react';
import MonitoredFbPagesClient from './MonitoredFbPagesClient';

export const dynamic = 'force-dynamic';

export default function MonitoredFbPagesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-700">Loading&hellip;</div>}>
      <MonitoredFbPagesClient />
    </Suspense>
  );
}
