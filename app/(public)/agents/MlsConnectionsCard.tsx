'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import Tip from './Tip';

type Mls = { id: string; name: string; market: string; url?: string };

const TEXAS_MLS: readonly Mls[] = [
  { id: 'ntreis', name: 'NTREIS', market: 'Dallas, Fort Worth and North Texas', url: 'https://www.ntreis.net' },
  { id: 'har', name: 'Houston Association of REALTORS (HAR)', market: 'Houston', url: 'https://www.har.com' },
  { id: 'sabor', name: 'SABOR MLS', market: 'San Antonio', url: 'https://sabor.com' },
  { id: 'unlock', name: 'Unlock MLS', market: 'Austin', url: 'https://www.unlockmls.com' },
  { id: 'ctxmls', name: 'Central Texas MLS (CTXMLS)', market: 'New Braunfels and Central Texas', url: 'https://ctxmls.com' },
  { id: 'rgv', name: 'Rio Grande Valley MLS', market: 'Harlingen and the Rio Grande Valley' },
  { id: 'south-texas', name: 'South Texas MLS (Corpus Christi Association of REALTORS)', market: 'Corpus Christi', url: 'https://www.ccaronline.com' },
  { id: 'bcs', name: 'Bryan-College Station Regional MLS', market: 'College Station', url: 'https://www.bcs.realtor' },
  { id: 'tyler', name: 'Greater Tyler Association of REALTORS', market: 'Tyler', url: 'https://www.gtar.com' },
  { id: 'deep-east', name: 'Deep East Texas MLS', market: 'Nacogdoches' },
  { id: 'longview', name: 'Longview Area Association of REALTORS', market: 'Longview', url: 'https://www.laaronline.org' },
  { id: 'henderson', name: 'Henderson County Board of REALTORS', market: 'Eustace' },
  { id: 'palestine', name: 'Palestine Association of REALTORS', market: 'Palestine' },
  { id: 'beaumont', name: 'Beaumont Board of REALTORS', market: 'Beaumont', url: 'https://bbor.online' },
  { id: 'galveston', name: 'Galveston Association of REALTORS', market: 'Galveston' },
  { id: 'brazoria', name: 'Brazoria County Board of REALTORS', market: 'Lake Jackson' },
  { id: 'txls', name: 'TXLS', market: 'Round Top', url: 'https://txls.com' },
  { id: 'central-hill', name: 'Central Hill Country Board of REALTORS', market: 'Fredericksburg' },
  { id: 'kerrville', name: 'Kerrville Board of REALTORS', market: 'Kerrville' },
  { id: 'highland-lakes', name: 'Highland Lakes Association of REALTORS', market: 'Marble Falls', url: 'https://www.hlaor.realtor' },
  { id: 'waco', name: 'Waco Association of REALTORS', market: 'Waco', url: 'https://wacorealtors.net' },
  { id: 'abilene', name: 'Abilene Association of REALTORS', market: 'Abilene', url: 'https://www.abileneaor.com' },
  { id: 'wichita-falls', name: 'Wichita Falls Association of REALTORS', market: 'Wichita Falls', url: 'https://www.wfar.com' },
  { id: 'texoma', name: 'Texoma Association of REALTORS', market: 'Sherman and Denison', url: 'https://www.texomarealtor.com' },
  { id: 'san-angelo', name: 'San Angelo Association of REALTORS', market: 'San Angelo', url: 'https://www.sanangelorealtors.org' },
  { id: 'nolan', name: 'Nolan County Board of REALTORS', market: 'Sweetwater' },
  { id: 'permian', name: 'Permian Basin Board of REALTORS', market: 'Midland' },
  { id: 'odessa', name: 'Odessa Board of REALTORS', market: 'Odessa' },
  { id: 'lubbock', name: 'Lubbock Association of REALTORS', market: 'Lubbock', url: 'https://lubbockrealtors.com' },
  { id: 'plainview', name: 'Plainview Association of REALTORS', market: 'Plainview', url: 'https://www.plainview-realtors.net' },
  { id: 'amarillo', name: 'Amarillo Association of REALTORS', market: 'Amarillo', url: 'https://www.amarillorealtors.org' },
  { id: 'pampa', name: 'Pampa Association of REALTORS', market: 'Pampa' },
  { id: 'dalhart', name: 'Dalhart Board of REALTORS', market: 'Dalhart' },
  { id: 'el-paso', name: 'Greater El Paso Association of REALTORS', market: 'El Paso', url: 'https://www.elpasotx.com' },
  { id: 'laredo', name: 'Laredo Association of REALTORS', market: 'Laredo', url: 'https://laredorealtors.org' },
  { id: 'mcallen', name: 'Greater McAllen Association of REALTORS', market: 'McAllen', url: 'https://www.gmar.org' },
  { id: 'rockport', name: 'Rockport Area Association of REALTORS', market: 'Rockport' },
  { id: 'spi', name: 'South Padre Island Board of REALTORS', market: 'South Padre Island', url: 'https://www.spirealtors.com' },
  { id: 'victoria', name: 'Victoria Association of REALTORS', market: 'Victoria', url: 'https://www.vaar.org' },
];

const STORAGE_KEY = 'closing-time-my-mls';

/** Settings card: every Texas MLS. The agent picks theirs and signs in to their own account on the MLS site. */
export default function MlsConnectionsCard() {
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSelected((JSON.parse(raw) as string[]).filter((id) => TEXAS_MLS.some((mls) => mls.id === id)));
    } catch { /* ignore */ }
  }, []);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEXAS_MLS
      .filter((mls) => !q || `${mls.name} ${mls.market}`.toLowerCase().includes(q))
      .sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)));
  }, [query, selected]);

  return (
    <div data-section-key="mls" className="min-w-0 rounded-xl border border-[#d4d8dd] bg-white p-[1.125rem] lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-gray-900">MLS Connections</h3>
        <span className="ds-chip bg-[#daeeff] text-[#005a8f]">{selected.length} Selected</span>
      </div>
      <Tip text="Choose the MLS services you belong to. You sign in to your own MLS account. Closing Time does not store your MLS password." />
      <label className="relative mt-4 block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or city" aria-label="Search Texas MLS services" className="h-9 w-full rounded-md border border-slate-300 pl-8 pr-3 text-sm" />
      </label>
      <div className="mt-3 max-h-[420px] overflow-y-auto overscroll-contain rounded-md border border-slate-200">
        {rows.length === 0 && <p className="px-4 py-4 text-sm text-slate-500">No MLS matches that search.</p>}
        {rows.map((mls) => (
          <div key={mls.id} className="ds-list-row">
            <input type="checkbox" aria-label={`Use ${mls.name}`} checked={selected.includes(mls.id)} onChange={() => toggle(mls.id)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{mls.name}</span>
              <span className="block truncate text-xs text-slate-500">{mls.market}</span>
            </span>
            <a
              href={mls.url ?? `https://www.google.com/search?q=${encodeURIComponent(`${mls.name} MLS login`)}`}
              target="_blank"
              rel="noreferrer"
              className="ds-row-btn"
            >
              {mls.url ? 'Sign In' : 'Find Sign In'}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">Selections are saved on this device. Sign In opens the MLS website in a new tab.</p>
    </div>
  );
}
