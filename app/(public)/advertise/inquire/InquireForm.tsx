'use client';

import { type PubKey } from '@/lib/pub-meta';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { APP_AD_SLOTS, PACKAGES, EBLASTS } from '@/lib/media-kit';
import {
  AD_CHANNELS,
  AD_CHANNEL_LABEL,
  AD_CHANNEL_DESCRIPTION,
  type AdChannel,
} from '@/lib/ad-channels';

type Status = 'idle' | 'submitting' | 'success' | 'error';

type Props = {
  initialSlot: string;
  initialSlotLabel: string;
  initialPackage: string;
  initialChannel: AdChannel;
  pub: PubKey;
};

// Stable id for an e-Blast package. EBLASTS rows don't carry an id field,
// so we derive one from the name (lowercase, spaces stripped). Keep this
// in sync with the matching lookup in app/(public)/advertise/inquire/page.tsx.
function eblastId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

export default function InquireForm({
  initialSlot,
  initialSlotLabel,
  initialPackage,
  initialChannel,
  pub,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Channel + sub-selection are live state so the buyer can switch
  // channels in the form without bouncing back to the rate card.
  const [channel, setChannel] = useState<AdChannel>(initialChannel);
  const [slot, setSlot] = useState<string>(
    initialChannel === 'digital' ? initialSlot : '',
  );
  const [pkg, setPkg] = useState<string>(
    initialChannel === 'print' || initialChannel === 'email'
      ? initialPackage
      : '',
  );

  // Captured on success so we can pre-fill the checkout page after the
  // brief confirmation interstitial. Kept in state (not just locals) so
  // the success screen can render the buyer's name in the headline.
  const [submitted, setSubmitted] = useState<{
    name: string;
    email: string;
    phone: string;
    company: string;
  } | null>(null);

  // Resolve the human-readable label for whatever the buyer has currently
  // selected. Drives the headline-style line above the message field and
  // the default message body.
  const selectedLabel = useMemo(() => {
    if (channel === 'digital' && slot) {
      return APP_AD_SLOTS.find((s) => s.slug === slot)?.name ?? '';
    }
    if (channel === 'print' && pkg) {
      return PACKAGES.find((p) => p.id === pkg)?.name ?? '';
    }
    if (channel === 'email' && pkg) {
      return EBLASTS.find((e) => eblastId(e.name) === pkg)?.name ?? '';
    }
    // Fall back to whatever the server resolved from the URL params.
    return initialSlotLabel;
  }, [channel, slot, pkg, initialSlotLabel]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');

    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get('name') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      phone: String(fd.get('phone') ?? '').trim(),
      company: String(fd.get('company') ?? '').trim(),
      message: String(fd.get('message') ?? '').trim(),
      channel,
      // Digital uses `slot`, Print/Email use `package_id`. We send the
      // value that's relevant for the current channel and leave the
      // other empty so the admin inbox can filter cleanly.
      slot: channel === 'digital' ? slot : '',
      slot_label: selectedLabel,
      package_id: channel === 'digital' ? '' : pkg,
      pub,
      // Honeypot — bots fill hidden fields. If non-empty, the API drops the
      // request silently and returns success so the bot doesn't retry.
      website: String(fd.get('website') ?? ''),
    };

    if (!payload.name || !payload.email || !payload.message) {
      setStatus('error');
      setErrorMsg('Name, email, and message are required.');
      return;
    }

    try {
      const res = await fetch('/api/inquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setStatus('error');
        setErrorMsg(body?.error ?? `Submit failed (${res.status})`);
        return;
      }
      setSubmitted({
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        company: payload.company,
      });
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
    }
  }

  // After a successful Digital inquiry with a specific slot picked, send
  // the buyer straight to the package / payment flow so they can
  // self-serve immediately. Print and Email don't have self-serve
  // checkout yet (PR C / PR D will add quote-then-pay flows) — those
  // channels stay on the confirmation screen.
  useEffect(() => {
    if (status !== 'success' || !submitted) return;
    if (channel !== 'digital') return;
    if (!slot) return;
    const target =
      `/advertise/checkout/${encodeURIComponent(slot)}?` +
      new URLSearchParams({
        pub,
        name: submitted.name,
        email: submitted.email,
        phone: submitted.phone,
        company: submitted.company,
      }).toString();
    const t = setTimeout(() => router.push(target), 1600);
    return () => clearTimeout(t);
  }, [status, submitted, channel, slot, pub, router]);

  if (status === 'success' && submitted) {
    const firstName = submitted.name.split(' ')[0] || submitted.name;
    const digitalRedirecting = channel === 'digital' && !!slot;
    return (
      <div
        className="border border-green-200 bg-green-50 p-6 rounded"
        role="status"
        aria-live="polite"
      >
        <p className="text-base font-semibold text-green-900 mb-1">
          Thanks, {firstName} — we&apos;ve got it.
        </p>
        {digitalRedirecting ? (
          <>
            <p className="text-sm text-green-900">
              Our ads team has been notified. Taking you to package options
              and secure payment&hellip;
            </p>
            <p className="text-xs text-green-800 mt-3">
              Not redirecting?{' '}
              <a
                href={
                  `/advertise/checkout/${encodeURIComponent(slot)}?` +
                  new URLSearchParams({
                    pub,
                    name: submitted.name,
                    email: submitted.email,
                    phone: submitted.phone,
                    company: submitted.company,
                  }).toString()
                }
                className="underline font-medium"
              >
                Continue here
              </a>
              .
            </p>
          </>
        ) : (
          <p className="text-sm text-green-900">
            Our ads team has been notified and will follow up within one
            business day with a quote, availability, and creative specs for
            your {AD_CHANNEL_LABEL[channel].toLowerCase()} inquiry.
          </p>
        )}
      </div>
    );
  }

  const disabled = status === 'submitting';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Channel picker — pills. Always visible so the buyer can switch
          without going back to the rate card. */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-gray-600 font-medium mb-1.5">
          Channel
        </label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ad channel">
          {AD_CHANNELS.map((c) => {
            const active = c === channel;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setChannel(c);
                  // Reset cross-channel selection so we never send a stale
                  // slot/package id that doesn't match the active channel.
                  if (c === 'digital') {
                    setPkg('');
                  } else {
                    setSlot('');
                  }
                }}
                disabled={disabled}
                className={[
                  'px-4 py-2 rounded-full border text-sm font-medium transition',
                  active
                    ? 'bg-[#1a2a44] text-white border-[#1a2a44]'
                    : 'bg-white text-gray-800 border-gray-300 hover:border-[#1a2a44]',
                ].join(' ')}
              >
                {AD_CHANNEL_LABEL[c]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-600 mt-2 leading-relaxed">
          {AD_CHANNEL_DESCRIPTION[channel]}
        </p>
      </div>

      {/* Sub-picker — digital placement, print package, or e-Blast package. */}
      {channel === 'digital' && (
        <div>
          <label
            htmlFor="slot"
            className="block text-xs uppercase tracking-wider text-gray-600 font-medium mb-1.5"
          >
            Placement <span className="text-gray-400">(optional)</span>
          </label>
          <select
            id="slot"
            name="slot"
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            disabled={disabled}
            className="w-full border border-gray-300 rounded px-3 py-2 text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2a44] focus:border-transparent"
          >
            <option value="">— Not sure yet, let&apos;s talk —</option>
            {APP_AD_SLOTS.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-600 mt-1.5">
            Pick a specific placement to jump straight to checkout after you
            submit, or leave blank and we&apos;ll recommend one.
          </p>
        </div>
      )}

      {channel === 'print' && (
        <div>
          <label
            htmlFor="package"
            className="block text-xs uppercase tracking-wider text-gray-600 font-medium mb-1.5"
          >
            Brand package <span className="text-gray-400">(optional)</span>
          </label>
          <select
            id="package"
            name="package"
            value={pkg}
            onChange={(e) => setPkg(e.target.value)}
            disabled={disabled}
            className="w-full border border-gray-300 rounded px-3 py-2 text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2a44] focus:border-transparent"
          >
            <option value="">— Not sure yet, let&apos;s talk —</option>
            {PACKAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.term}
              </option>
            ))}
          </select>
        </div>
      )}

      {channel === 'email' && (
        <div>
          <label
            htmlFor="package"
            className="block text-xs uppercase tracking-wider text-gray-600 font-medium mb-1.5"
          >
            e-Blast package <span className="text-gray-400">(optional)</span>
          </label>
          <select
            id="package"
            name="package"
            value={pkg}
            onChange={(e) => setPkg(e.target.value)}
            disabled={disabled}
            className="w-full border border-gray-300 rounded px-3 py-2 text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#1a2a44] focus:border-transparent"
          >
            <option value="">— Not sure yet, let&apos;s talk —</option>
            {EBLASTS.map((e) => (
              <option key={eblastId(e.name)} value={eblastId(e.name)}>
                {e.name} — ${e.price.toLocaleString()}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label
          htmlFor="name"
          className="block text-xs uppercase tracking-wider text-gray-600 font-medium mb-1.5"
        >
          Your name <span className="text-red-600">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          disabled={disabled}
          className="w-full border border-gray-300 rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#1a2a44] focus:border-transparent"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label
            htmlFor="email"
            className="block text-xs uppercase tracking-wider text-gray-600 font-medium mb-1.5"
          >
            Email <span className="text-red-600">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            disabled={disabled}
            className="w-full border border-gray-300 rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#1a2a44] focus:border-transparent"
          />
        </div>
        <div>
          <label
            htmlFor="phone"
            className="block text-xs uppercase tracking-wider text-gray-600 font-medium mb-1.5"
          >
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            disabled={disabled}
            className="w-full border border-gray-300 rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#1a2a44] focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="company"
          className="block text-xs uppercase tracking-wider text-gray-600 font-medium mb-1.5"
        >
          Company / brokerage
        </label>
        <input
          id="company"
          name="company"
          type="text"
          autoComplete="organization"
          disabled={disabled}
          className="w-full border border-gray-300 rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#1a2a44] focus:border-transparent"
        />
      </div>

      <div>
        <label
          htmlFor="message"
          className="block text-xs uppercase tracking-wider text-gray-600 font-medium mb-1.5"
        >
          Tell us what you&apos;re looking for{' '}
          <span className="text-red-600">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          disabled={disabled}
          // Reset the default message whenever the buyer changes the
          // selected slot/package — we use `key` so React remounts the
          // textarea with a fresh defaultValue.
          key={`${channel}:${slot}:${pkg}`}
          defaultValue={
            selectedLabel
              ? `Interested in the ${selectedLabel} (${AD_CHANNEL_LABEL[channel]}).`
              : `Interested in ${AD_CHANNEL_LABEL[channel].toLowerCase()} advertising.`
          }
          className="w-full border border-gray-300 rounded px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#1a2a44] focus:border-transparent"
        />
      </div>

      {/* Honeypot — kept off-screen, normal users never see or fill it. */}
      <div className="absolute -left-[10000px] top-auto w-px h-px overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Website (leave blank)</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {status === 'error' && errorMsg && (
        <p className="text-sm text-red-700">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center justify-center px-6 py-3 bg-[#1a2a44] text-white font-medium rounded hover:bg-[#243857] disabled:bg-gray-400 disabled:cursor-not-allowed transition"
      >
        {disabled ? 'Sending…' : 'Send inquiry'}
      </button>
    </form>
  );
}
