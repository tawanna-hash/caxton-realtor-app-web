'use client';

// components/inventory/RequestInfoBox.tsx
//
// "Request more information" card shown in the right column of /inventory/[id].
//
// When a community has a builder contact link on file (see
// lib/community-contacts.ts), the CTA links out to that form — e.g.
// Newmark's per-community #contactarea — which forwards the lead straight to
// the builder's sales team. Communities without a mapped link fall back to
// the inline email form (POST /api/listing-inquiry → RNN team + builder).
//
// Both paths fire `inventory_request_info_clicked` so the admin metrics
// dashboard can count requests per builder regardless of destination.
//
// Plum-themed (#5a0e5f) header so it reads as a primary call-to-action.

import { useState } from 'react';
import { trackEvent } from '@/app/posthog-provider';

type Props = {
  listingId: number;
  title: string;
  builderName: string;
  communityName?: string | null;
  // Builder-side contact form URL for this community. When present, the box
  // becomes a link-out instead of the inline form.
  contactUrl?: string | null;
};

type Status = 'idle' | 'submitting' | 'success' | 'error';

const INPUT_CLS =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#5a0e5f] focus:outline-none focus:ring-1 focus:ring-[#5a0e5f]';
const LABEL_CLS = 'block text-xs font-medium uppercase tracking-[0.08em] text-gray-600 mb-1';

export default function RequestInfoBox({
  listingId,
  title,
  builderName,
  communityName,
  contactUrl,
}: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  function trackRequestInfo(destination: 'builder_contact_form' | 'rnn_email') {
    trackEvent('inventory_request_info_clicked', {
      listing_id: listingId,
      builder_name: builderName,
      community_name: communityName ?? null,
      destination,
    });
  }

  // --- Link-out mode: route to the builder's community contact form ---
  if (contactUrl) {
    const communityLabel = communityName ? `${communityName} by ${builderName}` : builderName;
    return (
      <div
        id="request-info"
        className="scroll-mt-24 border border-[#5a0e5f]/20 rounded-lg overflow-hidden"
      >
        <div className="bg-[#5a0e5f] px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-white">
            Request more information
          </h2>
          <p className="mt-0.5 text-xs text-white/80">
            Get details and availability straight from the builder&apos;s sales team.
          </p>
        </div>
        <div className="px-4 py-5">
          <p className="text-sm text-gray-700">
            Interested in {communityLabel}? Use {builderName}&apos;s contact form and their
            sales team will follow up directly.
          </p>
          <a
            href={contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackRequestInfo('builder_contact_form')}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#5a0e5f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#301D5D] transition-colors"
          >
            Request more information
            <span aria-hidden="true" className="text-base leading-none">↗</span>
          </a>
          <p className="mt-2 text-center text-[11px] text-gray-400">
            Opens {builderName}&apos;s contact form in a new tab.
          </p>
        </div>
      </div>
    );
  }

  // --- Fallback mode: inline email form (no builder contact link on file) ---
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      listing_id: listingId,
      listing_title: title,
      builder_name: builderName,
      first_name: String(data.get('first_name') ?? '').trim(),
      last_name: String(data.get('last_name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim(),
      message: String(data.get('message') ?? '').trim(),
      is_realtor: data.get('is_realtor') === 'on',
      website: String(data.get('website') ?? '').trim(), // honeypot
    };

    try {
      const res = await fetch('/api/listing-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      setStatus('success');
      form.reset();
      trackEvent('inventory_inquiry_submitted', {
        listing_id: listingId,
        builder_name: builderName,
      });
      trackRequestInfo('rnn_email');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div
      id="request-info"
      className="scroll-mt-24 border border-[#5a0e5f]/20 rounded-lg overflow-hidden"
    >
      <div className="bg-[#5a0e5f] px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-white">
          Request more information
        </h2>
        <p className="mt-0.5 text-xs text-white/80">
          Interested in this home? Send us your details and we&apos;ll be in touch.
        </p>
      </div>

      {status === 'success' ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-medium text-[#5a0e5f]">Thanks — your request was sent.</p>
          <p className="mt-1 text-xs text-gray-500">
            A member of our team will reach out shortly.
          </p>
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="mt-3 text-xs font-medium text-[#5a0e5f] hover:underline"
          >
            Send another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 px-4 py-4">
          {/* honeypot — hidden from humans */}
          <div aria-hidden="true" className="hidden">
            <label htmlFor="website-ri">Website</label>
            <input
              id="website-ri"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ri-first" className={LABEL_CLS}>
                First name
              </label>
              <input
                id="ri-first"
                name="first_name"
                type="text"
                required
                maxLength={100}
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label htmlFor="ri-last" className={LABEL_CLS}>
                Last name
              </label>
              <input
                id="ri-last"
                name="last_name"
                type="text"
                required
                maxLength={100}
                className={INPUT_CLS}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ri-email" className={LABEL_CLS}>
              Email
            </label>
            <input
              id="ri-email"
              name="email"
              type="email"
              required
              maxLength={320}
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label htmlFor="ri-phone" className={LABEL_CLS}>
              Phone <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <input
              id="ri-phone"
              name="phone"
              type="tel"
              maxLength={50}
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label htmlFor="ri-message" className={LABEL_CLS}>
              Message <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <textarea
              id="ri-message"
              name="message"
              rows={3}
              maxLength={5000}
              defaultValue={`I'd like more information about ${title}.`}
              className={`${INPUT_CLS} resize-none`}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              name="is_realtor"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-[#5a0e5f] focus:ring-[#5a0e5f]"
            />
            I am a Realtor
          </label>

          {status === 'error' && (
            <p className="text-xs text-red-600">
              {errorMsg || 'Could not send. Please try again.'}
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full rounded-md bg-[#5a0e5f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#301D5D] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {status === 'submitting' ? 'Sending…' : 'Submit'}
          </button>
          <p className="text-center text-[11px] text-gray-400">
            Protected against spam. We&apos;ll never share your info.
          </p>
        </form>
      )}
    </div>
  );
}
