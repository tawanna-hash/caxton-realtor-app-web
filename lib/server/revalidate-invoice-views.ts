import { revalidatePath } from 'next/cache';

const INVOICE_VIEW_PATHS = [
  '/admin/getpaid',
  '/admin/getpaid/invoices',
  '/admin/getpaid/salestransactions',
  '/admin/getpaid/accountsreceivables',
  '/admin/invoices',
  '/admin/ar',
] as const;

export function revalidateInvoiceViews(invoiceId?: string): void {
  for (const path of INVOICE_VIEW_PATHS) revalidatePath(path);
  if (invoiceId) {
    revalidatePath(`/admin/invoices/${invoiceId}/preview`);
    revalidatePath(`/portal/invoices/${invoiceId}`);
  }
}
