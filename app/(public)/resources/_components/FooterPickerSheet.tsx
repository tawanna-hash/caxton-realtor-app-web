'use client';

// app/(public)/resources/_components/FooterPickerSheet.tsx
//
// Modal sheet that appears when an agent or broker taps "Download" on a
// /resources calculator. Renders the six footer templates as thumbnails
// (small visual approximations - not an actual PDF preview, just enough
// for the user to recognise the layout) and lets them pick one.
//
// State machine the sheet handles:
//
//   - Not signed in    -> show the "Sign in" empty state with a portal link.
//                         User can still tap "Download without footer".
//   - Signed in, brand
//     incomplete       -> show the templates, but pin a "Complete your
//                         profile to make these look real" callout with a
//                         link to /portal/account.
//   - Signed in, brand
//     complete         -> templates + radio selection + "Use this footer".
//
// The selected template is remembered in localStorage so the next
// download skips straight to confirmation (caller can still re-open).

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

const LS_KEY = 'rnn:footer-template';

export interface FooterPickerResult {
  template: FooterTemplateId | null; // null = no footer
  brand: FooterBrand | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: FooterPickerResult) => void;
}

interface MePayload {
  signed_in: boolean;
  default_footer_template?: string;
  brand?: FooterBrand;
}

export default function FooterPickerSheet({ open, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [brand, setBrand] = useState<FooterBrand | null>(null);
  const [selected, setSelected] = useState<FooterTemplateId>(FOOTER_TEMPLATE_DEFAULT);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      // Reset loading flag for re-opens (deferred via the async IIFE so we
      // don't synchronously setState inside the effect body).
      if (!cancelled) setLoading(true);

      // Pull localStorage preference up-front so signed-out users still
      // get a remembered choice.
      let lsPref: FooterTemplateId | null = null;
      try {
        const raw = window.localStorage.getItem(LS_KEY);
        if (raw) lsPref = coerceFooterTemplateId(raw);
      } catch { /* ignore */ }

      try {
        const res = await fetch('/api/portal/me', { credentials: 'same-origin' });
        if (cancelled) return;
        if (res.status === 401) {
          setSignedIn(false);
          setBrand(null);
          setSelected(lsPref ?? FOOTER_TEMPLATE_DEFAULT);
        } else if (res.ok) {
          const data: MePayload = await res.json();
          if (cancelled) return;
          setSignedIn(Boolean(data.signed_in));
          setBrand(data.brand ?? null);
          setSelected(
            lsPref
              ?? coerceFooterTemplateId(data.default_footer_template)
              ?? FOOTER_TEMPLATE_DEFAULT,
          );
        } else {
          setSignedIn(false);
          setBrand(null);
          setSelected(lsPref ?? FOOTER_TEMPLATE_DEFAULT);
        }
      } catch {
        setSignedIn(false);
        setBrand(null);
        setSelected(lsPref ?? FOOTER_TEMPLATE_DEFAULT);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const brandComplete = useMemo(
    () => (brand ? brandLooksComplete(brand) : false),
    [brand],
  );

  function persistAndConfirm(template: FooterTemplateId | null) {
    if (template) {
      try { window.localStorage.setItem(LS_KEY, template); } catch { /* ignore */ }
    }
    onConfirm({ template, brand });
  }

  if (!open) return null;

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
              Footer template
            </div>
            <h2
              className="font-serif text-xl text-gray-900 mt-1"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              Add your brand to this download
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
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="text-sm text-gray-500 py-8 text-center">Loading...</div>
          ) : !signedIn ? (
            <SignedOutPrompt
              onContinueWithoutFooter={() => persistAndConfirm(null)}
            />
          ) : (
            <>
              {!brandComplete && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
            </>
          )}
        </div>

        {/* Footer actions */}
        {!loading && (
          <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50">
            {signedIn ? (
              <>
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
                  className="rounded-lg bg-[#1a2a44] text-white px-5 py-2 text-sm font-medium hover:bg-[#0f1c30]"
                >
                  Use this footer & download
                </button>
              </>
            ) : (
              <div className="ml-auto" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function SignedOutPrompt({ onContinueWithoutFooter }: { onContinueWithoutFooter: () => void }) {
  return (
    <div className="text-center py-6">
      <div className="mx-auto h-12 w-12 rounded-full bg-[#1a2a44]/5 flex items-center justify-center mb-3">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a2a44" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </div>
      <h3 className="font-serif text-lg text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
        Sign in to add your brand
      </h3>
      <p className="text-sm text-gray-600 mt-1 max-w-sm mx-auto">
        Brokers and agents who sign in to the portal can stamp every download
        with their own footer template - logo, contact info, license, the works.
      </p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <Link
          href="/portal"
          className="rounded-lg bg-[#1a2a44] text-white px-5 py-2 text-sm font-medium hover:bg-[#0f1c30]"
        >
          Sign in to portal
        </Link>
        <button
          type="button"
          onClick={onContinueWithoutFooter}
          className="text-sm text-gray-600 hover:text-gray-900 underline"
        >
          Download without footer
        </button>
      </div>
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
