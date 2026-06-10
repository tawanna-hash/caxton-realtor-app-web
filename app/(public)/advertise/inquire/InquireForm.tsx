'use client';

import { useState } from 'react';

type Status = 'idle' | 'submitting' | 'success' | 'error';

type Props = {
  initialSlot: string;
  initialSlotLabel: string;
  pub: 'realtyline' | 'newsline';
};

export default function InquireForm({
  initialSlot,
  initialSlotLabel,
  pub,
}: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

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
      slot: initialSlot,
      slot_label: initialSlotLabel,
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
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
    }
  }

  if (status === 'success') {
    return (
      <div className="border border-green-200 bg-green-50 p-6 rounded">
        <p className="text-base font-semibold text-green-900 mb-1">
          Thanks — we&apos;ve got it.
        </p>
        <p className="text-sm text-green-900">
          Your inquiry is on its way to our ads team at ads@myrealtyline.com.
          We&apos;ll follow up within one business day.
        </p>
      </div>
    );
  }

  const disabled = status === 'submitting';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
          defaultValue={
            initialSlotLabel ? `Interested in the ${initialSlotLabel} slot.` : ''
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
