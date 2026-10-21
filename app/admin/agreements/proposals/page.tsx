import { redirect } from 'next/navigation';

export default function ProposalsIndex() {
  redirect('/admin/agreements/renewals-v2?tab=sent');
}
