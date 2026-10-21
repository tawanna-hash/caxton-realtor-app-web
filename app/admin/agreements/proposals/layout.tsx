// Proposals (Beta): Sent, Drafts, Archived, Templates and Default settings,
// laid out like Anchor's Proposals section. Runs beside the live Agreements
// screens; it only reads and edits Beta data.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import ProposalsNav from './ProposalsNav';

export const dynamic = 'force-dynamic';

export default async function ProposalsLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[color:var(--ds-ink)]">Proposals <span className="ml-1 rounded-full border border-[color:var(--ds-primary)] px-2 py-0.5 align-middle text-xs font-medium text-[color:var(--ds-primary)]">Beta</span></h1>
        <p className="text-sm text-[color:var(--ds-body)]">Create, send and manage the proposals your partners review and sign.</p>
      </div>
      <ProposalsNav />
      {children}
    </div>
  );
}
