'use client';

import { printCurrentPage } from '@/lib/native/print';

export default function PrintInvoiceButton() {
  return (
    <button
      type="button"
      onClick={() => { void printCurrentPage({ url: window.location.href }); }}
      className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 print:hidden"
    >
      Print / Save PDF
    </button>
  );
}
