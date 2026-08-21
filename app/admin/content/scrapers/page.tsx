// Server component: fetches last-run rows once per request and passes
// them to the client. Client component owns the interactive Run-now
// buttons and status.

import ScraperHubClient from './ScraperHubClient';
import { listScraperRuns } from '@/lib/scraper-runs';

export const dynamic = 'force-dynamic';

export default async function ScraperHubPage() {
  const runs = await listScraperRuns();
  return <ScraperHubClient initialRuns={runs} />;
}
