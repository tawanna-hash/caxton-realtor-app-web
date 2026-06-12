'use client';

// app/admin/preview/logo-options/LogoOptionsClient.tsx
//
// Six different treatments of the public advertiser header, side-by-
// side, using a real advertiser's data so the comparison is honest.
// Pick a direction and tell me - I'll ship that one to
// AdvertiserDetailClient.tsx.

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Advertiser } from '@/lib/advertisers';

type Picker = Array<{ id: number; slug: string; name: string; avatar_url: string | null }>;

const ACCENT = '#0F1F4D'; // RealtyLine Austin navy
const PUB_LABEL = 'REALTYLINE AUSTIN';

function isBrowserRenderableImage(url: string): boolean {
  const m = url.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  if (!m) return true;
  const ext = m[1].toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'ico', 'bmp'].includes(ext);
}

function Monogram({ name, size = 'text-3xl' }: { name: string; size?: string }) {
  return (
    <span className={`${size} font-semibold`} style={{ color: ACCENT }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

// Branded social icon set (same family as production header)
function SocialDot({ label }: { label: string }) {
  const path: Record<string, ReactNode> = {
    Facebook: <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.5-1.5h1.5V5c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9V11H8v3h2.3v7h3.2z" />,
    Instagram: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17.1" cy="6.9" r="1" />
      </>
    ),
    LinkedIn: <path d="M6.5 8.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM5 10h3v9H5v-9zm5 0h2.9v1.3h.04c.4-.75 1.4-1.55 2.86-1.55 3.06 0 3.6 2 3.6 4.6V19h-3v-4.1c0-1 0-2.3-1.4-2.3-1.4 0-1.6 1.1-1.6 2.2V19h-3v-9z" />,
    X: <path d="M17.5 4h2.8l-6.2 7.1L21.5 20h-5.7l-4.5-5.8L6.2 20H3.4l6.7-7.6L3 4h5.8l4 5.3L17.5 4zm-1 14.4h1.6L7.6 5.5H6L16.5 18.4z" />,
    YouTube: <path d="M22 12c0-2.4-.2-4-.6-4.7-.4-.6-1-1-1.6-1.1C18.4 6 12 6 12 6s-6.4 0-7.8.2c-.6.1-1.2.5-1.6 1.1C2.2 8 2 9.6 2 12s.2 4 .6 4.7c.4.6 1 1 1.6 1.1C5.6 18 12 18 12 18s6.4 0 7.8-.2c.6-.1 1.2-.5 1.6-1.1.4-.7.6-2.3.6-4.7zM10 15V9l5 3-5 3z" />,
  };
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      {path[label]}
    </svg>
  );
}

function SocialRow({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'w-9 h-9' : 'w-8 h-8';
  const labels = ['Facebook', 'Instagram', 'LinkedIn', 'X', 'YouTube'];
  return (
    <ul className="flex items-center gap-1.5" aria-label="Social links">
      {labels.map((lbl) => (
        <li key={lbl}>
          <span
            className={`inline-flex items-center justify-center ${cls} rounded-full border border-gray-200 bg-white text-gray-600`}
          >
            <SocialDot label={lbl} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function VisitWebsiteBtn({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const padding = size === 'lg' ? 'px-5 py-2.5 text-base' : size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${padding} font-medium text-white rounded-md`}
      style={{ backgroundColor: ACCENT }}
    >
      Visit website
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M5 3h6v6M11 3L5.5 8.5M3 5v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

// ---------- The six variants ----------

function VariantBox({ id, title, blurb, children }: { id: number; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            Option {id} - {title}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{blurb}</p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-gray-400">Preview</span>
      </div>
      <div className="p-6 sm:p-8">{children}</div>
    </section>
  );
}

function Identity({ a, size = 'lg' }: { a: Advertiser; size?: 'md' | 'lg' | 'xl' }) {
  const nameCls =
    size === 'xl' ? 'text-4xl sm:text-5xl' : size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl';
  return (
    <>
      <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">{PUB_LABEL}</p>
      <h1 className={`${nameCls} font-serif font-bold tracking-tight text-gray-900 mt-1`}>
        {a.name}
      </h1>
      {a.tagline && (
        <p className="text-base sm:text-lg text-gray-700 font-light mt-2 leading-relaxed">
          {a.tagline}
        </p>
      )}
      {a.industry && <p className="text-sm text-gray-500 font-light mt-1">{a.industry}</p>}
    </>
  );
}

function LogoTile({
  a,
  size,
  shape = 'square',
  bg = 'gray',
  border = true,
  shadow = false,
}: {
  a: Advertiser;
  size: number; // px
  shape?: 'square' | 'rounded' | 'circle';
  bg?: 'gray' | 'white' | 'tint';
  border?: boolean;
  shadow?: boolean;
}) {
  const radius =
    shape === 'circle' ? 'rounded-full' : shape === 'rounded' ? 'rounded-2xl' : 'rounded-md';
  const bgCls = bg === 'white' ? 'bg-white' : bg === 'tint' ? '' : 'bg-gray-50';
  const borderCls = border ? 'border border-gray-200' : '';
  const shadowCls = shadow ? 'shadow-md' : '';
  const tintStyle = bg === 'tint' ? { backgroundColor: `${ACCENT}10` } : undefined;
  return (
    <div
      className={`shrink-0 ${bgCls} ${borderCls} ${radius} ${shadowCls} overflow-hidden flex items-center justify-center`}
      style={{ width: size, height: size, ...tintStyle }}
    >
      {a.avatar_url && isBrowserRenderableImage(a.avatar_url) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.avatar_url} alt={a.name} className="w-full h-full object-contain p-3" />
      ) : (
        <Monogram name={a.name} size={size > 120 ? 'text-5xl' : 'text-3xl'} />
      )}
    </div>
  );
}

// Option 1: current production look (baseline)
function Option1Current({ a }: { a: Advertiser }) {
  return (
    <header className="flex items-start gap-5 sm:gap-7">
      <LogoTile a={a} size={144} />
      <div className="flex-1">
        <Identity a={a} size="lg" />
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <VisitWebsiteBtn />
          <SocialRow />
        </div>
      </div>
    </header>
  );
}

// Option 2: borderless tile with soft shadow on white card
function Option2Borderless({ a }: { a: Advertiser }) {
  return (
    <header className="flex items-start gap-6">
      <LogoTile a={a} size={160} bg="white" border={false} shadow shape="rounded" />
      <div className="flex-1">
        <Identity a={a} size="lg" />
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <VisitWebsiteBtn />
          <SocialRow />
        </div>
      </div>
    </header>
  );
}

// Option 3: full-width banner - logo on a tinted brand strip above the name
function Option3Banner({ a }: { a: Advertiser }) {
  return (
    <header>
      <div
        className="flex items-center justify-center py-10 rounded-xl mb-6"
        style={{ backgroundColor: `${ACCENT}0D` }}
      >
        {a.avatar_url && isBrowserRenderableImage(a.avatar_url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.avatar_url} alt={a.name} className="max-h-24 w-auto object-contain" />
        ) : (
          <Monogram name={a.name} size="text-6xl" />
        )}
      </div>
      <div>
        <Identity a={a} size="xl" />
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <VisitWebsiteBtn size="lg" />
          <SocialRow size="md" />
        </div>
      </div>
    </header>
  );
}

// Option 4: pill chip - small inline logo + name on one line, like a brand bar
function Option4InlineChip({ a }: { a: Advertiser }) {
  return (
    <header>
      <div className="inline-flex items-center gap-3 pl-2 pr-5 py-2 border border-gray-200 rounded-full bg-white mb-4">
        <span className="w-10 h-10 rounded-full bg-white border border-gray-200 overflow-hidden flex items-center justify-center">
          {a.avatar_url && isBrowserRenderableImage(a.avatar_url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.avatar_url} alt="" className="w-full h-full object-contain p-1" />
          ) : (
            <Monogram name={a.name} size="text-base" />
          )}
        </span>
        <span className="text-sm font-semibold text-gray-900">{a.name}</span>
        <span className="text-xs uppercase tracking-wider text-gray-500">{PUB_LABEL}</span>
      </div>
      <div>
        {a.tagline && (
          <h1 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-gray-900 leading-tight">
            {a.tagline}
          </h1>
        )}
        {a.industry && <p className="text-sm text-gray-500 font-light mt-2">{a.industry}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-5">
          <VisitWebsiteBtn />
          <SocialRow />
        </div>
      </div>
    </header>
  );
}

// Option 5: large rounded soft card, tinted background pulled from accent
function Option5SoftTint({ a }: { a: Advertiser }) {
  return (
    <header className="flex items-start gap-7">
      <LogoTile a={a} size={176} bg="tint" border={false} shape="rounded" />
      <div className="flex-1">
        <Identity a={a} size="lg" />
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <VisitWebsiteBtn />
          <SocialRow />
        </div>
      </div>
    </header>
  );
}

// Option 6: centered, stacked, no frame around the logo - editorial feel
function Option6Centered({ a }: { a: Advertiser }) {
  return (
    <header className="text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-4">{PUB_LABEL}</p>
      <div className="flex items-center justify-center mb-5">
        {a.avatar_url && isBrowserRenderableImage(a.avatar_url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.avatar_url} alt={a.name} className="max-h-28 w-auto object-contain" />
        ) : (
          <Monogram name={a.name} size="text-7xl" />
        )}
      </div>
      <h1 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-gray-900">{a.name}</h1>
      {a.tagline && (
        <p className="text-base sm:text-lg text-gray-700 font-light mt-3 leading-relaxed max-w-2xl mx-auto">
          {a.tagline}
        </p>
      )}
      {a.industry && <p className="text-sm text-gray-500 font-light mt-2">{a.industry}</p>}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
        <VisitWebsiteBtn />
        <SocialRow />
      </div>
    </header>
  );
}

// ----------- Page wrapper -----------

export default function LogoOptionsClient({
  advertiser,
  picker,
}: {
  advertiser: Advertiser;
  picker: Picker;
}) {
  const [slug, setSlug] = useState(advertiser.slug);
  const a = advertiser;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Logo design options</h1>
          <p className="text-sm text-gray-600 mt-1">
            Six treatments of the public advertiser header rendered with{' '}
            <strong>{a.name}</strong>&apos;s real data. Pick one and tell me which
            to ship.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs uppercase tracking-wider text-gray-500">Try with:</label>
          <select
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              window.location.href = `/admin/preview/logo-options?slug=${encodeURIComponent(e.target.value)}`;
            }}
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white"
          >
            {picker.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name}
                {p.avatar_url ? '  (has logo)' : '  (no logo)'}
              </option>
            ))}
          </select>
          <Link
            href={`/advertisers/${a.slug}`}
            target="_blank"
            className="text-xs text-[#3D0740] hover:underline ml-2"
          >
            View live page -&gt;
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        <VariantBox
          id={1}
          title="Current"
          blurb="Today's production look: 144px square tile, light-gray background, thin border, contain."
        >
          <Option1Current a={a} />
        </VariantBox>

        <VariantBox
          id={2}
          title="Borderless on white with shadow"
          blurb="Slightly larger 160px tile, soft drop shadow, rounded corners, no border. Modern app feel."
        >
          <Option2Borderless a={a} />
        </VariantBox>

        <VariantBox
          id={3}
          title="Brand banner"
          blurb="Logo centered on a tinted accent-color strip above the name. Maximum presence, magazine cover energy."
        >
          <Option3Banner a={a} />
        </VariantBox>

        <VariantBox
          id={4}
          title="Inline brand chip"
          blurb="Small logo + name as a pill chip, then the tagline becomes the hero headline. Editorial."
        >
          <Option4InlineChip a={a} />
        </VariantBox>

        <VariantBox
          id={5}
          title="Soft tinted tile"
          blurb="176px rounded tile with a subtle accent-tinted background, no border. Looks premium and quiet."
        >
          <Option5SoftTint a={a} />
        </VariantBox>

        <VariantBox
          id={6}
          title="Centered editorial"
          blurb="Logo + name + tagline all centered, no frame. Reads like a magazine feature page."
        >
          <Option6Centered a={a} />
        </VariantBox>
      </div>

      <div className="mt-10 text-xs text-gray-500">
        Preview only - nothing here is on the public site. Tell me which option you want and I&apos;ll wire it into{' '}
        <code className="px-1 py-0.5 bg-gray-100 rounded">AdvertiserDetailClient.tsx</code>.
      </div>
    </main>
  );
}
