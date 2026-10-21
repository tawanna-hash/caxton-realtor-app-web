import { redirect } from 'next/navigation';

export default function ProposalsIndex() {
  redirect('/admin/agreements/proposals/sent');
}
