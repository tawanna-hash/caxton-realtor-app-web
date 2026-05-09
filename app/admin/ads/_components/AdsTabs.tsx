// caxton-ads-v1
// Tab switcher for /admin/ads. URL state via ?tab=...

'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export type AdTab = 'catalog' | 'campaigns' | 'creatives';

interface Props {
  current: AdTab;
  catalogCount: number;
  campaignsCount: number;
  creativesCount: number;
}

export function AdsTabs({ current, catalogCount, campaignsCount, creativesCount }: Props) {
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
    { key: 'campaigns', label: 'Campaigns', count: campaignsCount },
    { key: 'creatives', label: 'Creatives', count: creativesCount },
  ];

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex gap-6">
        {tabs.map((t) => {
          const isActive = current === t.key;
          return (
            <button
              key={t.key}
              onClick={() => go(t.key)}
              className={`py-3 border-b-2 text-sm font-medium ${
                isActive
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              {t.label}
              <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                {t.count}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
