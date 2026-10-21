import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/admin/agreements/renewals-v2?tab=archived');
}
