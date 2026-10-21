import { ReportView } from '../ReportsBeta';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  return <ReportView slug={report} />;
}
