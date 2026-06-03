'use client';

// app/(public)/resources/ResourcesClient.tsx
//
// Client component — purely presentational. Pulls all content from
// lib/realtor-resources.ts. No fetches, no state beyond expand/collapse.

import { useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import {
  RESOURCE_GUIDES,
  RESOURCE_VENDORS,
  RESOURCE_VIDEOS,
  RESOURCE_LINKS,
  type ResourceGuide,
  type ResourceVendor,
  type ResourceVideo,
  type ResourceLink,
} from '@/lib/realtor-resources';

const EYEBROW = 'text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2';
const SECTION_EYEBROW = 'text-xs font-semibold uppercase tracking-[0.2em] text-[#1a2a44] mb-4';

export default function ResourcesClient() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-12 md:py-16">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <header className="mb-12">
        <p className={EYEBROW}>REALTOR® Resources</p>
        <PageTitle>Tools, partners, and training for Austin agents.</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          A curated collection of downloadable guides, recommended vendors,
          training videos, and external links our team relies on. Have
          something to add?{' '}
          <a
            href="mailto:hello@myrealtyline.com?subject=Resources%20Page%20Suggestion"
            className="text-[#1a2a44] font-medium underline underline-offset-2"
          >
            Send us a suggestion
          </a>
          .
        </p>
      </header>

      {/* ── Quick jump links ────────────────────────────────────────── */}
      <nav className="mb-12 flex flex-wrap gap-2 text-sm">
        {[
          { href: '#guides', label: 'Guides & PDFs' },
          { href: '#vendors', label: 'Vendors' },
          { href: '#videos', label: 'Videos' },
          { href: '#links', label: 'External Links' },
        ].map((j) => (
          <a
            key={j.href}
            href={j.href}
            className="px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:border-[#1a2a44] hover:text-[#1a2a44] transition"
          >
            {j.label}
          </a>
        ))}
      </nav>

      {/* ── Section 1: Guides ───────────────────────────────────────── */}
      <section id="guides" className="mb-16 scroll-mt-24">
        <p className={SECTION_EYEBROW}>Downloadable Guides</p>
        <h2
          className="text-2xl md:text-3xl text-gray-900 mb-6"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
        >
          PDFs, checklists, and workbooks
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {RESOURCE_GUIDES.map((g) => (
            <GuideCard key={g.title} guide={g} />
          ))}
        </div>
      </section>

      {/* ── Section 2: Vendors ──────────────────────────────────────── */}
      <section id="vendors" className="mb-16 scroll-mt-24">
        <p className={SECTION_EYEBROW}>Recommended Vendors</p>
        <h2
          className="text-2xl md:text-3xl text-gray-900 mb-6"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
        >
          Trusted partners for every transaction
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {RESOURCE_VENDORS.map((v) => (
            <VendorCard key={v.name} vendor={v} />
          ))}
        </div>
      </section>

      {/* ── Section 3: Videos ───────────────────────────────────────── */}
      <section id="videos" className="mb-16 scroll-mt-24">
        <p className={SECTION_EYEBROW}>Training Videos</p>
        <h2
          className="text-2xl md:text-3xl text-gray-900 mb-6"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
        >
          Watch & learn
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          {RESOURCE_VIDEOS.map((v) => (
            <VideoCard key={v.title} video={v} />
          ))}
        </div>
      </section>

      {/* ── Section 4: External Links ───────────────────────────────── */}
      <section id="links" className="mb-16 scroll-mt-24">
        <p className={SECTION_EYEBROW}>Curated Links</p>
        <h2
          className="text-2xl md:text-3xl text-gray-900 mb-6"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
        >
          Official sources & industry reference
        </h2>
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          {RESOURCE_LINKS.map((l) => (
            <LinkRow key={l.href + l.title} link={l} />
          ))}
        </ul>
      </section>

      {/* ── Footer note ─────────────────────────────────────────────── */}
      <p className="text-xs text-gray-500 mt-12">
        This page is updated periodically. Listing a vendor here is a
        recommendation, not an endorsement — confirm fit for your transaction
        and client.
      </p>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card components
// ─────────────────────────────────────────────────────────────────────────────

function GuideCard({ guide }: { guide: ResourceGuide }) {
  const isPlaceholder = guide.href === '#';
  return (
    <a
      href={guide.href}
      target={isPlaceholder ? undefined : '_blank'}
      rel={isPlaceholder ? undefined : 'noopener noreferrer'}
      className="block rounded-lg border border-gray-200 bg-white p-5 hover:border-[#1a2a44] hover:shadow-sm transition"
      onClick={(e) => {
        if (isPlaceholder) e.preventDefault();
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        {guide.category && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1a2a44] bg-[#1a2a44]/5 px-2 py-0.5 rounded">
            {guide.category}
          </span>
        )}
        <span className="text-xs text-gray-400">
          {isPlaceholder ? 'Coming soon' : 'PDF'}
        </span>
      </div>
      <p className="font-semibold text-gray-900 mb-1">{guide.title}</p>
      <p className="text-sm text-gray-700 font-light leading-relaxed">
        {guide.description}
      </p>
    </a>
  );
}

function VendorCard({ vendor }: { vendor: ResourceVendor }) {
  const isPlaceholder = vendor.href === '#';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1a2a44] bg-[#1a2a44]/5 px-2 py-0.5 rounded">
          {vendor.category}
        </span>
      </div>
      <p className="font-semibold text-gray-900 mb-1">{vendor.name}</p>
      <p className="text-sm text-gray-700 font-light leading-relaxed mb-3">
        {vendor.description}
      </p>
      {vendor.contact && (
        <p className="text-xs text-gray-600 mb-2">{vendor.contact}</p>
      )}
      {!isPlaceholder && (
        <a
          href={vendor.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-[#1a2a44] underline underline-offset-2 hover:no-underline"
        >
          Visit website →
        </a>
      )}
    </div>
  );
}

function VideoCard({ video }: { video: ResourceVideo }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="aspect-video bg-gray-100 relative">
        {playing ? (
          <iframe
            src={video.embedUrl}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 transition group"
          >
            <span className="w-14 h-14 rounded-full bg-white/90 group-hover:bg-white shadow-md flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#1a2a44">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="font-semibold text-gray-900">{video.title}</p>
          {video.duration && (
            <span className="text-xs text-gray-500">{video.duration}</span>
          )}
        </div>
        <p className="text-sm text-gray-700 font-light leading-relaxed">
          {video.description}
        </p>
      </div>
    </div>
  );
}

function LinkRow({ link }: { link: ResourceLink }) {
  return (
    <li>
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-5 py-4 hover:bg-gray-50 transition"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900 mb-0.5">{link.title}</p>
            <p className="text-sm text-gray-700 font-light leading-relaxed">
              {link.description}
            </p>
          </div>
          {link.source && (
            <span className="text-xs text-gray-500 flex-shrink-0 mt-1">
              {link.source} →
            </span>
          )}
        </div>
      </a>
    </li>
  );
}
