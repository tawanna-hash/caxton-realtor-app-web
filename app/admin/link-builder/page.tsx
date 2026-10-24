'use client';

// app/admin/link-builder/page.tsx
//
// Builds UTM-tagged links for Facebook and Instagram posts. Marketing
// Performance counts any visit with utm_medium=social as Social.
// Runs entirely in the browser; nothing is saved.

import { useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';

const SITE = 'https://realtynewsnow.app';

const PLATFORMS = [
  { value: 'facebook_realtyline', label: 'RealtyLine Facebook page' },
  { value: 'facebook_newslinesa', label: 'Newsline San Antonio Facebook page' },
  { value: 'instagram_realtyline', label: 'myrealtyline Instagram' },
  { value: 'instagram_newslinesa', label: 'newsline_sanantonio Instagram' },
] as const;

function slug(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
}

function build(destination: string, source: string, campaign: string): { url: string | null; error: string | null; offSite: boolean } {
  const raw = destination.trim();
  if (!raw) return { url: null, error: null, offSite: false };
  let u: URL;
  try {
    u = raw.startsWith('/') ? new URL(raw, SITE) : new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { url: null, error: 'That does not look like a valid link.', offSite: false };
  }
  const host = u.hostname.replace(/^www\./, '');
  const offSite = host !== 'realtynewsnow.app';
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', 'social');
  const c = slug(campaign);
  if (c) u.searchParams.set('utm_campaign', c); else u.searchParams.delete('utm_campaign');
  return { url: u.toString(), error: null, offSite };
}

export default function LinkBuilderPage() {
  const [destination, setDestination] = useState('/');
  const [source, setSource] = useState<string>(PLATFORMS[0].value);
  const [campaign, setCampaign] = useState('weekly_issue');
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => build(destination, source, campaign), [destination, source, campaign]);
  const isInstagram = source.startsWith('instagram');

  async function copy() {
    if (!result.url) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  const field = 'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none';

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <PageTitle size="md">Social Link Builder</PageTitle>
      <p className="mt-1 text-sm text-gray-600">
        Adds tracking to a link before you post it, so Marketing Performance counts the visit as Social instead of Direct.
      </p>

      <div className="mt-5 space-y-4 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">
          Page you are linking to
          <input className={field} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="/ or https://realtynewsnow.app/..." />
          <span className="mt-1 block text-xs font-normal text-gray-500">Paste a full link, or just the path starting with a slash.</span>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Where you are posting it
          <select className={field} value={source} onChange={(e) => setSource(e.target.value)}>
            {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        <label className="block text-sm font-medium text-gray-700">
          Campaign name
          <input className={field} value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="weekly_issue" />
          <span className="mt-1 block text-xs font-normal text-gray-500">
            Short and consistent, such as weekly_issue, event_nov_5_mixer, bio_link or story. Saved as {slug(campaign) || 'none'}.
          </span>
        </label>
      </div>

      <div className="mt-4 rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-700">Your tagged link</p>
        {result.error && <p className="mt-2 text-sm text-[#661102]">{result.error}</p>}
        {result.url ? (
          <>
            <p className="mt-2 break-all rounded bg-gray-50 p-3 font-mono text-xs text-gray-900">{result.url}</p>
            <button
              type="button"
              onClick={copy}
              className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            {result.offSite && (
              <p className="mt-3 text-xs text-[#661102]">
                This link goes to another website. Tags only help on realtynewsnow.app links.
              </p>
            )}
            {isInstagram && (
              <p className="mt-3 text-xs text-gray-500">
                Instagram captions and comments do not make links clickable. Use this link in your bio or a Story link sticker.
              </p>
            )}
          </>
        ) : !result.error ? (
          <p className="mt-2 text-sm text-gray-500">Enter a page to build the link.</p>
        ) : null}
      </div>
    </div>
  );
}
