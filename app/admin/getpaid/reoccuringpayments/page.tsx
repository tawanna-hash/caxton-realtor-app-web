// Recurring invoices now live in Billing > Recurring invoices. This forwards old links.
import { redirect } from 'next/navigation';

export default function RecurringRedirect() {
  redirect('/admin/billing-hub?tab=recurring');
}
