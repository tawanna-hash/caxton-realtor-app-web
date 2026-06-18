'use client';

// components/AdvertiserHeader.tsx
//
// Shared advertiser-detail-page header. Switches between six layouts
// based on the advertiser's `header_style` column. Used by the public
// advertiser page (/advertisers/[slug]). The dedicated admin design
// preview at /admin/preview/logo-options was removed once the styles
// were locked in.
//
// To add a new style:
//   1. Append the slug to ADVERTISER_HEADER_STYLES in
//      lib/advertiser-header-styles.ts and to HEADER_STYLE_META.
//   2. Add a case in renderByStyle() below.
// The admin dropdown and PATCH route pick it up automatically.

import type { ReactNode } from 'react';
import type {
  AdvertiserHeaderStyle,
} from '@/lib/advertiser-header-styles';
import { coerceHeaderStyle } from '@/lib/advertiser-header-styles';

export type SocialKey = 'Facebook' | 'Instagram' | 'LinkedIn' | 'X' | 'YouTube';

export interface AdvertiserHeaderData {
  name: string;
  tagline?: string | null;
  industry?: string | null;
  avatar_url?: string | null;
  website?: string | null;
  social: Partial<Record<SocialKey, string | null | undefined>>;
}

export interface AdvertiserHeaderTheme {
  /** The publication label shown above the name in small caps. */
  label: string;
  /** The publication accent color used for CTAs and brand strips. */
  accent: string;
}

export function isBrowserRenderableImage(url: string): boolean {
  const m = url.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  if (!m) return true;
  const ext = m[1].toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'ico', 'bmp'].includes(ext);
}

// ── Atom: branded social icon ─────────────────────────────────────────
function SocialGlyph({ label }: { label: SocialKey }) {
  switch (label) {
    case 'Facebook':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.5-1.5h1.5V5c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9V11H8v3h2.3v7h3.2z" />
        </svg>
      );
    case 'Instagram':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
          <circle cx="12" cy="12" r="3.8" />
          <circle cx="17.1" cy="6.9" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'LinkedIn':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M6.5 8.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM5 10h3v9H5v-9zm5 0h2.9v1.3h.04c.4-.75 1.4-1.55 2.86-1.55 3.06 0 3.6 2 3.6 4.6V19h-3v-4.1c0-1 0-2.3-1.4-2.3-1.4 0-1.6 1.1-1.6 2.2V19h-3v-9z" />
        </svg>
      );
    case 'X':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M17.5 4h2.8l-6.2 7.1L21.5 20h-5.7l-4.5-5.8L6.2 20H3.4l6.7-7.6L3 4h5.8l4 5.3L17.5 4zm-1 14.4h1.6L7.6 5.5H6L16.5 18.4z" />
        </svg>
      );
    case 'YouTube':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M22 12c0-2.4-.2-4-.6-4.7-.4-.6-1-1-1.6-1.1C18.4 6 12 6 12 6s-6.4 0-7.8.2c-.6.1-1.2.5-1.6 1.1C2.2 8 2 9.6 2 12s.2 4 .6 4.7c.4.6 1 1 1.6 1.1C5.6 18 12 18 12 18s6.4 0 7.8-.2c.6-.1 1.2-.5 1.6-1.1.4-.7.6-2.3.6-4.7zM10 15V9l5 3-5 3z" />
        </svg>
      );
  }
}

function SocialIconLink({
  href,
  label,
  accent,
  size = 'sm',
}: {
  href: string;
  label: SocialKey;
  accent: string;
  size?: 'sm' | 'md';
}) {
  const cls = size === 'md' ? 'w-9 h-9' : 'w-8 h-8';
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title={label}
        className={`inline-flex items-center justify-center ${cls} rounded-full border border-gray-200 bg-white text-gray-600 hover:text-white transition-colors`}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = accent;
          e.currentTarget.style.borderColor = accent;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '';
          e.currentTarget.style.borderColor = '';
        }}
      >
        <SocialGlyph label={label} />
      </a>
    </li>
  );
}

function SocialList({
  data,
  accent,
  size = 'sm',
}: {
  data: AdvertiserHeaderData;
  accent: string;
  size?: 'sm' | 'md';
}) {
  const entries: Array<[SocialKey, string]> = [];
  if (data.social.Facebook) entries.push(['Facebook', data.social.Facebook]);
  if (data.social.Instagram) entries.push(['Instagram', data.social.Instagram]);
  if (data.social.LinkedIn) entries.push(['LinkedIn', data.social.LinkedIn]);
  if (data.social.X) entries.push(['X', data.social.X]);
  if (data.social.YouTube) entries.push(['YouTube', data.social.YouTube]);
  if (entries.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Social links">
      {entries.map(([label, href]) => (
        <SocialIconLink key={label} href={href} label={label} accent={accent} size={size} />
      ))}
    </ul>
  );
}

function VisitWebsiteLink({
  href,
  accent,
  size = 'md',
}: {
  href: string;
  accent: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const padding =
    size === 'lg' ? 'px-5 py-2.5 text-base' : size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 ${padding} font-medium text-white rounded-md transition-opacity hover:opacity-90`}
      style={{ backgroundColor: accent }}
    >
      Visit website
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M5 3h6v6M11 3L5.5 8.5M3 5v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

function Monogram({ name, sizeCls, accent }: { name: string; sizeCls: string; accent: string }) {
  return (
    <span className={`${sizeCls} font-semibold`} style={{ color: accent }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function LogoTile({
  data,
  size,
  shape = 'square',
  bg = 'gray',
  border = true,
  shadow = false,
  accent,
}: {
  data: AdvertiserHeaderData;
  size: number;
  shape?: 'square' | 'rounded-md' | 'circle';
  bg?: 'gray' | 'white' | 'tint';
  border?: boolean;
  shadow?: boolean;
  accent: string;
}) {
  const radius =
    shape === 'circle' ? 'rounded-full' : shape === 'rounded-md' ? 'rounded-md' : 'rounded-md';
  const bgCls = bg === 'white' ? 'bg-white' : bg === 'tint' ? '' : 'bg-gray-50';
  const borderCls = border ? 'border border-gray-200' : '';
  const shadowCls = shadow ? 'shadow-md' : '';
  const tintStyle = bg === 'tint' ? { backgroundColor: `${accent}10` } : undefined;
  return (
    <div
      className={`shrink-0 ${bgCls} ${borderCls} ${radius} ${shadowCls} overflow-hidden flex items-center justify-center`}
      style={{ width: size, height: size, ...tintStyle }}
    >
      {data.avatar_url && isBrowserRenderableImage(data.avatar_url) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.avatar_url} alt={`${data.name} logo`} className="w-full h-full object-contain p-3" />
      ) : (
        <Monogram name={data.name} sizeCls={size > 120 ? 'text-5xl' : 'text-3xl'} accent={accent} />
      )}
    </div>
  );
}

function Identity({
  data,
  theme,
  size = 'lg',
}: {
  data: AdvertiserHeaderData;
  theme: AdvertiserHeaderTheme;
  size?: 'md' | 'lg' | 'xl';
}) {
  const nameCls =
    size === 'xl'
      ? 'text-3xl sm:text-4xl'
      : size === 'lg'
        ? 'text-2xl sm:text-3xl'
        : 'text-xl sm:text-2xl';
  return (
    <>
      <p
        className="text-xs uppercase tracking-[0.2em] font-medium mb-2"
        style={{ color: theme.accent }}
      >
        {theme.label}
      </p>
      <h1
        className={`${nameCls} font-semibold text-gray-900 tracking-tight`}
      >
        {data.name}
      </h1>
      {data.tagline && (
        <p className="text-base sm:text-lg text-gray-700 font-light mt-2 leading-relaxed">
          {data.tagline}
        </p>
      )}
      {data.industry && (
        <p className="text-sm text-gray-500 font-light mt-1">{data.industry}</p>
      )}
    </>
  );
}

function Ctas({
  data,
  accent,
  size = 'md',
  socialSize = 'sm',
}: {
  data: AdvertiserHeaderData;
  accent: string;
  size?: 'sm' | 'md' | 'lg';
  socialSize?: 'sm' | 'md';
}) {
  if (!data.website && !Object.values(data.social).some(Boolean)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mt-4">
      {data.website && <VisitWebsiteLink href={data.website} accent={accent} size={size} />}
      <SocialList data={data} accent={accent} size={socialSize} />
    </div>
  );
}

// ── Six layouts ──────────────────────────────────────────────────────

function Current({ data, theme }: { data: AdvertiserHeaderData; theme: AdvertiserHeaderTheme }) {
  return (
    <header className="flex items-start gap-5 sm:gap-7 mb-8 sm:mb-10">
      <LogoTile data={data} size={144} accent={theme.accent} />
      <div className="flex-1 min-w-0">
        <Identity data={data} theme={theme} size="lg" />
        <Ctas data={data} accent={theme.accent} />
      </div>
    </header>
  );
}

function Borderless({ data, theme }: { data: AdvertiserHeaderData; theme: AdvertiserHeaderTheme }) {
  return (
    <header className="flex items-start gap-6 mb-8 sm:mb-10">
      <LogoTile
        data={data}
        size={160}
        bg="white"
        border={false}
        shadow
        shape="rounded-md"
        accent={theme.accent}
      />
      <div className="flex-1 min-w-0">
        <Identity data={data} theme={theme} size="lg" />
        <Ctas data={data} accent={theme.accent} />
      </div>
    </header>
  );
}

function Banner({ data, theme }: { data: AdvertiserHeaderData; theme: AdvertiserHeaderTheme }) {
  return (
    <header className="mb-8 sm:mb-10">
      <div
        className="flex items-center justify-center py-10 rounded-md mb-6"
        style={{ backgroundColor: `${theme.accent}0D` }}
      >
        {data.avatar_url && isBrowserRenderableImage(data.avatar_url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.avatar_url} alt={`${data.name} logo`} className="max-h-24 w-auto object-contain" />
        ) : (
          <Monogram name={data.name} sizeCls="text-6xl" accent={theme.accent} />
        )}
      </div>
      <Identity data={data} theme={theme} size="xl" />
      <Ctas data={data} accent={theme.accent} size="lg" socialSize="md" />
    </header>
  );
}

function Chip({ data, theme }: { data: AdvertiserHeaderData; theme: AdvertiserHeaderTheme }) {
  return (
    <header className="mb-8 sm:mb-10">
      <div className="inline-flex items-center gap-3 pl-2 pr-5 py-2 border border-gray-200 rounded-full bg-white mb-4">
        <span className="w-10 h-10 rounded-full bg-white border border-gray-200 overflow-hidden flex items-center justify-center">
          {data.avatar_url && isBrowserRenderableImage(data.avatar_url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.avatar_url} alt="" className="w-full h-full object-contain p-1" />
          ) : (
            <Monogram name={data.name} sizeCls="text-base" accent={theme.accent} />
          )}
        </span>
        <span className="text-sm font-semibold text-gray-900">{data.name}</span>
        <span className="text-xs uppercase tracking-wider" style={{ color: theme.accent }}>
          {theme.label}
        </span>
      </div>
      {data.tagline ? (
        <h1
          className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight leading-tight"
        >
          {data.tagline}
        </h1>
      ) : (
        <h1
          className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight leading-tight"
        >
          {data.name}
        </h1>
      )}
      {data.industry && (
        <p className="text-sm text-gray-500 font-light mt-2">{data.industry}</p>
      )}
      <Ctas data={data} accent={theme.accent} />
    </header>
  );
}

function Tint({ data, theme }: { data: AdvertiserHeaderData; theme: AdvertiserHeaderTheme }) {
  return (
    <header className="flex items-start gap-7 mb-8 sm:mb-10">
      <LogoTile data={data} size={176} bg="tint" border={false} shape="rounded-md" accent={theme.accent} />
      <div className="flex-1 min-w-0">
        <Identity data={data} theme={theme} size="lg" />
        <Ctas data={data} accent={theme.accent} />
      </div>
    </header>
  );
}

function Centered({ data, theme }: { data: AdvertiserHeaderData; theme: AdvertiserHeaderTheme }) {
  return (
    <header className="text-center mb-8 sm:mb-10">
      <p
        className="text-xs uppercase tracking-[0.2em] font-medium mb-4"
        style={{ color: theme.accent }}
      >
        {theme.label}
      </p>
      <div className="flex items-center justify-center mb-5">
        {data.avatar_url && isBrowserRenderableImage(data.avatar_url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.avatar_url} alt={`${data.name} logo`} className="max-h-28 w-auto object-contain" />
        ) : (
          <Monogram name={data.name} sizeCls="text-7xl" accent={theme.accent} />
        )}
      </div>
      <h1
        className="text-3xl sm:text-4xl font-semibold text-gray-900 tracking-tight"
      >
        {data.name}
      </h1>
      {data.tagline && (
        <p className="text-base sm:text-lg text-gray-700 font-light mt-3 leading-relaxed max-w-2xl mx-auto">
          {data.tagline}
        </p>
      )}
      {data.industry && <p className="text-sm text-gray-500 font-light mt-2">{data.industry}</p>}
      <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
        {data.website && <VisitWebsiteLink href={data.website} accent={theme.accent} />}
        <SocialList data={data} accent={theme.accent} />
      </div>
    </header>
  );
}

function renderByStyle(
  style: AdvertiserHeaderStyle,
  data: AdvertiserHeaderData,
  theme: AdvertiserHeaderTheme,
): ReactNode {
  switch (style) {
    case 'borderless':
      return <Borderless data={data} theme={theme} />;
    case 'banner':
      return <Banner data={data} theme={theme} />;
    case 'chip':
      return <Chip data={data} theme={theme} />;
    case 'tint':
      return <Tint data={data} theme={theme} />;
    case 'centered':
      return <Centered data={data} theme={theme} />;
    case 'current':
    default:
      return <Current data={data} theme={theme} />;
  }
}

export default function AdvertiserHeader({
  style,
  data,
  theme,
}: {
  style: AdvertiserHeaderStyle | string | null | undefined;
  data: AdvertiserHeaderData;
  theme: AdvertiserHeaderTheme;
}) {
  return <>{renderByStyle(coerceHeaderStyle(style), data, theme)}</>;
}
