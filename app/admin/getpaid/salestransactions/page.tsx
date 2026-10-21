// Sales transactions now live in Billing > Invoices (Type filter: Sales receipts).
import { redirect } from 'next/navigation';

export default function SalesTransactionsRedirect() {
  redirect('/admin/billing-hub?tab=invoices');
}
