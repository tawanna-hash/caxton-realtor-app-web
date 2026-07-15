'use client';

// app/admin/ads/orders/_components/OrdersPageClient.tsx
//
// View-tab wrapper that renders one of:
//   ?view=orders     (default) — OrdersTable (campaigns + agreements)
//   ?view=ios                 — IosTable (insertion_orders)
//   ?view=tearsheets          — TearsheetsTable

import { useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import OrdersTable from './OrdersTable';
import IosTable from './IosTable';
import TearsheetsTable from './TearsheetsTable';

type View = 'orders' | 'ios' | 'tearsheets';
const VIEWS: readonly View[] = ['orders', 'ios', 'tearsheets'] as const;
const VIEW_LABEL: Record<View, string> = {
  orders: 'Orders',
  ios: 'Insertion Orders',
  tearsheets: 'Tearsheets',
};

export default function OrdersPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const viewParam = params.get('view');
  const activeView: View =
    viewParam && (VIEWS as readonly string[]).includes(viewParam)
      ? (viewParam as View)
      : 'orders';

  const setView = useCallback(
    (v: View) => {
      const sp = new URLSearchParams(params.toString());
      // Reset filter state so channel/status/q from one view don't leak
      // into another (their meanings differ).
      sp.delete('channel');
      sp.delete('status');
      sp.delete('source');
      sp.delete('q');
      if (v === 'orders') sp.delete('view');
      else sp.set('view', v);
      const s = sp.toString();
      router.replace(`${pathname}${s ? `?${s}` : ''}`);
    },
    [params, pathname, router],
  );

  return (
    <div>
      <div className="flex gap-1 mb-6 p-1 rounded-lg bg-gray-100 w-fit">
        {VIEWS.map((v) => {
          const isActive = activeView === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={
                'px-4 py-1.5 text-sm font-medium rounded-md transition-colors ' +
                (isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900')
              }
            >
              {VIEW_LABEL[v]}
            </button>
          );
        })}
      </div>

      {activeView === 'orders' && <OrdersTable />}
      {activeView === 'ios' && <IosTable />}
      {activeView === 'tearsheets' && <TearsheetsTable />}
    </div>
  );
}
