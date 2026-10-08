'use client';

import { useState } from 'react';
import { Phone } from 'lucide-react';

type Provider = { name: string; phone: string; note?: string };
type Category = { title: string; note?: string; providers: Provider[] };
type Market = { id: string; label: string; area: string; categories: Category[] };

const MARKETS: Market[] = [
  {
    id: 'austin', label: 'Austin', area: 'Austin Metro (Travis, Williamson, Hays)',
    categories: [
      { title: 'Electricity (Regulated)', providers: [
        { name: 'Austin Energy (City of Austin)', phone: '512-494-9400', note: 'Inside city limits' },
        { name: 'Pedernales Electric Cooperative (PEC)', phone: '888-554-4732', note: 'Western suburbs and Hill Country' },
        { name: 'Bluebonnet Electric Cooperative', phone: '800-842-7708', note: 'Eastern suburbs' },
      ] },
      { title: 'Natural Gas', providers: [
        { name: 'Texas Gas Service', phone: '800-700-2443', note: 'Primary provider' },
        { name: 'Atmos Energy', phone: '888-286-6700', note: 'Suburbs and Round Rock' },
      ] },
      { title: 'Water & Sewer', providers: [
        { name: 'Austin Water', phone: '512-972-0000' },
        { name: 'Georgetown Utility Systems', phone: '512-930-3640' },
      ] },
    ],
  },
  {
    id: 'san-antonio', label: 'San Antonio', area: 'San Antonio Metro (Bexar, Comal)',
    categories: [
      { title: 'Electricity & Natural Gas (Regulated)', note: 'San Antonio operates a combined, regulated municipal utility. CPS Energy is the sole provider for both electricity and natural gas inside the city and most of Bexar County.', providers: [
        { name: 'CPS Energy', phone: '210-353-2222' },
      ] },
      { title: 'Water & Sewer', providers: [
        { name: 'San Antonio Water System (SAWS)', phone: '210-704-7297' },
        { name: 'Guadalupe-Blanco River Authority (GBRA)', phone: '830-379-5822' },
      ] },
    ],
  },
  {
    id: 'houston', label: 'Houston', area: 'Houston Metro (Harris, Fort Bend, Montgomery)',
    categories: [
      { title: 'Electricity (Deregulated)', note: 'Houston is also deregulated. CenterPoint maintains the poles and infrastructure, but residents choose their retail electricity provider via PowerToChoose.org.', providers: [
        { name: 'CenterPoint Energy (Grid Operator)', phone: '800-332-7143' },
      ] },
      { title: 'Natural Gas', providers: [
        { name: 'CenterPoint Energy Gas', phone: '800-752-8036' },
      ] },
      { title: 'Water & Sewer', providers: [
        { name: 'Houston Public Works', phone: '713-371-1400' },
        { name: 'Gulf Coast Water Authority', phone: '409-948-3111' },
      ] },
    ],
  },
  {
    id: 'dfw', label: 'Dallas / Ft. Worth', area: 'Dallas / Fort Worth Metroplex',
    categories: [
      { title: 'Electricity (Deregulated)', note: 'DFW is a deregulated market. Oncor maintains the power lines and responds to outages, but residents must purchase their actual electricity from a Retail Electric Provider (for example TXU, Reliant, Gexa) via PowerToChoose.org.', providers: [
        { name: 'Oncor (Grid Operator)', phone: '888-313-4747' },
      ] },
      { title: 'Natural Gas', providers: [
        { name: 'Atmos Energy', phone: '888-286-6700', note: 'Primary DFW provider' },
        { name: 'CoServ Gas', phone: '800-274-4014', note: 'Northern suburbs' },
      ] },
      { title: 'Water & Sewer', providers: [
        { name: 'Dallas Water Utilities', phone: '214-651-1441' },
        { name: 'Fort Worth Water Department', phone: '817-392-4477' },
        { name: 'North Texas Municipal Water District (NTMWD)', phone: '972-442-5405' },
      ] },
    ],
  },
];

function ProviderRow({ provider }: { provider: Provider }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-[#F6F3FB] px-4 py-3 last:border-0">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{provider.name}</span>
        {provider.note ? <span className="block text-xs text-slate-500">{provider.note}</span> : null}
      </span>
      <a href={`tel:${provider.phone.replace(/[^0-9]/g, '')}`} className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-[#301D5D] hover:underline" aria-label={`Call ${provider.name}`}>
        <Phone className="h-3.5 w-3.5" aria-hidden="true" />{provider.phone}
      </a>
    </li>
  );
}

export default function UtilitiesPanel() {
  const [marketId, setMarketId] = useState(MARKETS[0].id);
  const market = MARKETS.find((m) => m.id === marketId) ?? MARKETS[0];
  return (
    <div className="ds-page space-y-4" data-testid="utilities-panel">
      <div>
        <h2 className="text-[22px] font-semibold text-[#1B1726]">Utilities</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">Who to call to set up service, by market.</p>
      </div>
      <div className="ds-tabs !mt-0" role="tablist" aria-label="Markets">
        {MARKETS.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={m.id === marketId} onClick={() => setMarketId(m.id)} className="ds-tab">{m.label}</button>
        ))}
      </div>
      <p className="text-sm font-semibold text-slate-900">{market.area}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {market.categories.map((category) => (
          <div key={category.title} className="ds-card !p-0 self-start">
            <p className="border-b border-[#E6E5EC] px-4 py-3 text-sm font-semibold text-slate-900">{category.title}</p>
            {category.note ? <p className="border-b border-[#F6F3FB] bg-[#F6F3FB] px-4 py-3 text-xs leading-5 text-slate-600">{category.note}</p> : null}
            <ul>{category.providers.map((provider) => <ProviderRow key={provider.name} provider={provider} />)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}
