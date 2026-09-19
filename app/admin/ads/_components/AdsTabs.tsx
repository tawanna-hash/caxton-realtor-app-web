// caxton-ads-v1
// Tab switcher for /admin/ads. URL state via ?tab=...
//
// Note: the "Campaigns" tab was removed in favor of /admin/ads/orders
// which unions ad_campaigns + agreements into a single pipeline view.
// /admin/ads is now inventory-focused: Catalog + Creatives.

'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export type AdTab = 'catalog' | 'creatives';

interface Props {
  current: AdTab;
  catalogCount: number;
  creativesCount: number;
}

export function AdsTabs({ current, catalogCount, creativesCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(tab: AdTab) {
    const sp = new URLSearchParams(params.toString());
    sp.set('tab', tab);
    router.push(`${pathname}?${sp.toString()}`);
  }

  const tabs: { key: AdTab; label: string; count: number }[] = [
    { key: 'catalog', label: 'Catalog', count: catalogCount },
    { key: 'creatives', label: 'Creatives', count: creativesCount },
  ];

  return (
    <div className="border-b border-gray-300">
      <nav className="-mb-px flex gap-5" aria-label="Inventory views">
        {tabs.map((t) => {
          const isActive = current === t.key;
          return (
            <button
              key={t.key}
              onClick={() => go(t.key)}
              type="button"
              className={`h-9 border-b-2 px-1 text-sm font-medium ${
                isActive
                  ? 'border-orange-600 text-orange-700'
                  : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              {t.label}
              <span className="ml-2 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs tabular-nums text-gray-700">
                {t.count}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
