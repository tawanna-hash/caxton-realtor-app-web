'use client';

// app/(public)/resources/_components/FooterPickerSheet.tsx
//
// Modal sheet that appears when a signed-in user taps "Download" on a
// /resources calculator. Three roles, three flows:
//
//   admin     - dropdown to pick which advertiser to brand the footer
//               as, then the 6 template thumbnails. (Tawanna / staff.)
//   portal    - magic-link broker/agent; their own brand is preloaded
//               and they pick a template.
//   anonymous - the caller never opens this sheet; downloads use the
//               generic site footer instead.
//
// The caller (ResourceFloater) decides which path to take by hitting
// /api/me/footer-context first and only opening the sheet when role
// is admin or portal.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FOOTER_TEMPLATE_IDS,
  FOOTER_TEMPLATE_META,
  FOOTER_TEMPLATE_DEFAULT,
  brandLooksComplete,
  coerceFooterTemplateId,
  type FooterBrand,
  type FooterTemplateId,
} from '@/lib/footer-templates';

const LS_TEMPLATE_KEY = 'rnn:footer-template';
const LS_ADMIN_ADVERTISER_KEY = 'rnn:footer-admin-advertiser-id';

export interface FooterPickerResult {
  template: FooterTemplateId | null; // null = no footer
  brand: FooterBrand | null;
}

interface AdvertiserOption { id: number; name: string; }

interface AdminInit {
  role: 'admin';
  advertisers: AdvertiserOption[];
}
interface PortalInit {
  role: 'portal';
  advertiser_id: number;
  default_footer_template: string;
  brand: FooterBrand;
}
export type FooterPickerInit = AdminInit | PortalInit;

interface Props {
  open: boolean;
  init: FooterPickerInit | null; // null while caller still loads context
  onClose: () => void;
  onConfirm: (result: FooterPickerResult) => void;
}

export default function FooterPickerSheet({ open, init, onClose, onConfirm }: Props) {
  // Admin-mode state
  const [adminAdvId, setAdminAdvId] = useState<number | null>(null);
  const [adminBrand, setAdminBrand] = useState<FooterBrand | null>(null);
  const [adminBrandLoading, setAdminBrandLoading] = useState(false);
  const [adminBrandError, setAdminBrandError] = useState<string | null>(null);

  // Shared template selection
  const [selected, setSelected] = useState<FooterTemplateId>(FOOTER_TEMPLATE_DEFAULT);

  // Initialise from `init` whenever the sheet opens or init changes
  useEffect(() => {
    if (!open || !init) return;
    let cancelled = false;

    void (async () => {
      // Per-device remembered template preference (used by both roles)
      let lsTpl: FooterTemplateId | null = null;
      try {
        const raw = window.localStorage.getItem(LS_TEMPLATE_KEY);
        if (raw) lsTpl = coerceFooterTemplateId(raw);
      } catch { /* ignore */ }

      if (cancelled) return;

      if (init.role === 'admin') {
        // Restore last-used advertiser id if it's still in the list
        let restored: number | null = null;
        try {
          const raw = window.localStorage.getItem(LS_ADMIN_ADVERTISER_KEY);
          if (raw) {
            const n = Number(raw);
            if (init.advertisers.some((a) => a.id === n)) restored = n;
          }
        } catch { /* ignore */ }
        if (cancelled) return;
        setAdminAdvId(restored);
        setAdminBrand(null);
        setAdminBrandError(null);
        setSelected(lsTpl ?? FOOTER_TEMPLATE_DEFAULT);
      } else {
        // portal
        setSelected(
          lsTpl ?? coerceFooterTemplateId(init.default_footer_template) ?? FOOTER_TEMPLATE_DEFAULT,
        );
      }
    })();

    return () => { cancelled = true; };
  }, [open, init]);

  // Whenever an admin picks an advertiser, fetch its brand fields
  useEffect(() => {
    if (!open || !init || init.role !== 'admin' || adminAdvId == null) return;
    let cancelled = false;
    (async () => {
      setAdminBrandLoading(true);
      setAdminBrandError(null);
      try {
        const res = await fetch(`/api/me/advertiser-brand/${adminAdvId}`, {
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { brand: FooterBrand };
        if (cancelled) return;
        setAdminBrand(data.brand);
      } catch (err) {
        if (cancelled) return;
        setAdminBrandError(err instanceof Error ? err.message : 'fetch failed');
        setAdminBrand(null);
      } finally {
        if (!cancelled) setAdminBrandLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, init, adminAdvId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const activeBrand: FooterBrand | null = useMemo(() => {
    if (!init) return null;
    if (init.role === 'portal') return init.brand;
    return adminBrand;
  }, [init, adminBrand]);

  const brandComplete = useMemo(
    () => (activeBrand ? brandLooksComplete(activeBrand) : false),
    [activeBrand],
  );

  function persistAndConfirm(template: FooterTemplateId | null) {
    if (template) {
      try { window.localStorage.setItem(LS_TEMPLATE_KEY, template); } catch { /* ignore */ }
    }
    if (init?.role === 'admin' && adminAdvId != null) {
      try { window.localStorage.setItem(LS_ADMIN_ADVERTISER_KEY, String(adminAdvId)); } catch { /* ignore */ }
    }
    onConfirm({ template, brand: activeBrand });
  }

  if (!open || !init) return null;

  const canConfirmFooter = Boolean(activeBrand) && !adminBrandLoading;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-gray-500 font-semibold">
              {init.role === 'admin' ? 'Admin - footer template' : 'Footer template'}
            </div>
            <h2
              className="font-serif text-xl text-gray-900 mt-1"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              {init.role === 'admin'
                ? 'Brand this download on behalf of...'
                : 'Add your brand to this download'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 h-9 w-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto space-y-4">
          {init.role === 'admin' && (
            <AdminAdvertiserPicker
              advertisers={init.advertisers}
              value={adminAdvId}
              onChange={setAdminAdvId}
              loading={adminBrandLoading}
              error={adminBrandError}
              loadedBrand={adminBrand}
            />
          )}

          {init.role === 'portal' && !brandComplete && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-medium mb-1">Your profile is missing a few fields.</div>
              <div>
                Templates will skip blank lines. For best results,{' '}
                <Link href="/portal/account" className="underline font-medium">
                  complete your profile
                </Link>
                {' '}(logo, phone, website, address) and come back.
              </div>
            </div>
          )}

          {(init.role === 'portal' || (init.role === 'admin' && activeBrand)) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {FOOTER_TEMPLATE_IDS.map((id) => (
                <TemplateThumb
                  key={id}
                  id={id}
                  selected={selected === id}
                  onSelect={() => setSelected(id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50">
          <button
            type="button"
            onClick={() => persistAndConfirm(null)}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            No footer
          </button>
          <button
            type="button"
            onClick={() => persistAndConfirm(selected)}
            disabled={!canConfirmFooter}
            className="rounded-lg bg-[#1a2a44] text-white px-5 py-2 text-sm font-medium hover:bg-[#0f1c30] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Use this footer & download
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function AdminAdvertiserPicker({
  advertisers,
  value,
  onChange,
  loading,
  error,
  loadedBrand,
}: {
  advertisers: AdvertiserOption[];
  value: number | null;
  onChange: (id: number) => void;
  loading: boolean;
  error: string | null;
  loadedBrand: FooterBrand | null;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 mb-2">
        Advertiser
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n > 0) onChange(n);
        }}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
      >
        <option value="">Select an advertiser...</option>
        {advertisers.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>

      {loading && (
        <div className="text-xs text-gray-500 mt-2">Loading brand fields...</div>
      )}
      {error && (
        <div className="text-xs text-red-700 mt-2">Could not load: {error}</div>
      )}
      {!loading && !error && loadedBrand && (
        <div className="text-xs text-gray-500 mt-2 truncate">
          Using:{' '}
          <span className="font-medium text-gray-800">
            {loadedBrand.name || loadedBrand.company || '(unnamed)'}
          </span>
          {loadedBrand.phone && <span> - {loadedBrand.phone}</span>}
          {loadedBrand.website && <span> - {loadedBrand.website.replace(/^https?:\/\//i, '')}</span>}
        </div>
      )}
      {!loading && !error && !loadedBrand && value == null && (
        <div className="text-xs text-gray-500 mt-2">
          Pick an advertiser to load their logo and contact details.
        </div>
      )}
    </div>
  );
}

function TemplateThumb({
  id,
  selected,
  onSelect,
}: {
  id: FooterTemplateId;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = FOOTER_TEMPLATE_META[id];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`text-left rounded-xl border p-3 transition ${
        selected
          ? 'border-[#1a2a44] ring-2 ring-[#1a2a44]/20 bg-white'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div className="aspect-[8/3] rounded-md bg-gray-50 border border-gray-100 overflow-hidden mb-2">
        <ThumbArt id={id} />
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-900">{meta.label}</div>
        {selected && (
          <span className="text-[10px] uppercase tracking-wider text-[#1a2a44] font-semibold">Selected</span>
        )}
      </div>
      <div className="text-xs text-gray-500 mt-0.5 leading-snug">{meta.blurb}</div>
    </button>
  );
}

/** Tiny SVG mock of each template - purely decorative. */
function ThumbArt({ id }: { id: FooterTemplateId }) {
  switch (id) {
    case 'business-card':
      return (
        <svg viewBox="0 0 160 60" className="w-full h-full">
          <rect width="160" height="60" fill="#ffffff" />
          <line x1="8" y1="10" x2="152" y2="10" stroke="#e5e7eb" strokeWidth="1" />
          <rect x="12" y="18" width="28" height="28" fill="#1a2a44" rx="2" />
          <rect x="48" y="22" width="60" height="6" fill="#111827" rx="1" />
          <rect x="48" y="34" width="90" height="3.5" fill="#6b7280" rx="1" />
          <rect x="48" y="42" width="70" height="3.5" fill="#6b7280" rx="1" />
        </svg>
      );
    case 'banner':
      return (
        <svg viewBox="0 0 160 60" className="w-full h-full">
          <rect width="160" height="60" fill="#ffffff" />
          <rect x="0" y="14" width="160" height="32" fill="#1a2a44" />
          <rect x="0" y="14" width="160" height="2" fill="#c4a35a" />
          <rect x="8" y="22" width="18" height="18" fill="#ffffff" opacity="0.95" rx="1" />
          <rect x="32" y="24" width="44" height="4" fill="#ffffff" opacity="0.95" />
          <rect x="32" y="34" width="34" height="3" fill="#ffffff" opacity="0.7" />
          <rect x="100" y="24" width="52" height="3.5" fill="#ffffff" opacity="0.85" />
          <rect x="110" y="34" width="42" height="3" fill="#ffffff" opacity="0.6" />
        </svg>
      );
    case 'minimal':
      return (
        <svg viewBox="0 0 160 60" className="w-full h-full">
          <rect width="160" height="60" fill="#ffffff" />
          <line x1="8" y1="22" x2="152" y2="22" stroke="#e5e7eb" strokeWidth="1" />
          <rect x="10" y="32" width="50" height="4" fill="#111827" />
          <rect x="100" y="32" width="52" height="4" fill="#6b7280" />
        </svg>
      );
    case 'signature':
      return (
        <svg viewBox="0 0 160 60" className="w-full h-full">
          <rect width="160" height="60" fill="#ffffff" />
          <line x1="8" y1="10" x2="152" y2="10" stroke="#e5e7eb" strokeWidth="1" />
          <rect x="12" y="14" width="32" height="32" rx="16" fill="#e7e3da" stroke="#c4a35a" strokeWidth="1.5" />
          <path d="M52 28 Q70 18 90 28 T130 28" stroke="#1a2a44" strokeWidth="1.8" fill="none" />
          <rect x="52" y="36" width="60" height="3" fill="#6b7280" />
          <rect x="52" y="44" width="80" height="3" fill="#9ca3af" />
        </svg>
      );
    case 'two-column':
      return (
        <svg viewBox="0 0 160 60" className="w-full h-full">
          <rect width="160" height="60" fill="#ffffff" />
          <line x1="8" y1="10" x2="152" y2="10" stroke="#e5e7eb" strokeWidth="1" />
          <rect x="12" y="14" width="22" height="22" fill="#1a2a44" rx="2" />
          <rect x="40" y="18" width="34" height="4" fill="#111827" />
          <rect x="40" y="28" width="30" height="3" fill="#6b7280" />
          <rect x="40" y="36" width="40" height="3" fill="#9ca3af" />
          <line x1="80" y1="14" x2="80" y2="48" stroke="#e5e7eb" strokeWidth="1" />
          <rect x="86" y="16" width="22" height="3.5" fill="#1a2a44" />
          <rect x="86" y="26" width="60" height="3" fill="#6b7280" />
          <rect x="86" y="34" width="50" height="3" fill="#6b7280" />
          <rect x="86" y="42" width="40" height="3" fill="#6b7280" />
        </svg>
      );
    case 'stacked':
      return (
        <svg viewBox="0 0 160 60" className="w-full h-full">
          <rect width="160" height="60" fill="#ffffff" />
          <line x1="8" y1="8" x2="152" y2="8" stroke="#e5e7eb" strokeWidth="1" />
          <rect x="74" y="12" width="12" height="12" fill="#1a2a44" rx="1" />
          <rect x="60" y="28" width="40" height="3.5" fill="#111827" />
          <rect x="50" y="36" width="60" height="3" fill="#6b7280" />
          <rect x="40" y="44" width="80" height="2.5" fill="#9ca3af" />
        </svg>
      );
  }
}
