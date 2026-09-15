'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { REFERRAL_PROVIDER_CATEGORIES, type ReferralProviderCategory } from '@/lib/server/referral-network-applications';

type FormState = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  categories: ReferralProviderCategory[];
  serviceAreas: string;
  licenseNumber: string;
  licenseState: string;
  licenseExpiresOn: string;
  licenseVerificationUrl: string;
  insuranceCarrier: string;
  insuranceExpiresOn: string;
  coverageNotes: string;
  message: string;
  consent: boolean;
  websiteTrap: string;
};

const INITIAL_FORM: FormState = {
  companyName: '', contactName: '', email: '', phone: '', website: '', categories: [], serviceAreas: '',
  licenseNumber: '', licenseState: 'Texas', licenseExpiresOn: '', licenseVerificationUrl: '',
  insuranceCarrier: '', insuranceExpiresOn: '', coverageNotes: '', message: '', consent: false, websiteTrap: '',
};

const INPUT = 'min-h-[48px] w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-[#301D5D] focus:ring-2 focus:ring-[#301D5D]/15';

export default function ProviderApplicationForm() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const toggleCategory = (category: ReferralProviderCategory) => {
    setForm((current) => ({
      ...current,
      categories: current.categories.includes(category)
        ? current.categories.filter((item) => item !== category)
        : [...current.categories, category].slice(0, 4),
    }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.categories.length === 0) {
      setError('Choose at least one service category.');
      return;
    }
    setStatus('submitting');
    setError('');
    try {
      const response = await fetch('/api/referral-network/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || 'Your application could not be submitted.');
      setStatus('success');
    } catch (submissionError) {
      setStatus('error');
      setError(submissionError instanceof Error ? submissionError.message : 'Your application could not be submitted.');
    }
  }

  if (status === 'success') {
    return (
      <main className="min-h-screen bg-[#F7F5F1] px-5 py-14 sm:px-8">
        <div className="mx-auto max-w-2xl border border-[#D8D0C2] bg-white p-8 shadow-[0_18px_45px_rgba(40,25,77,0.08)] sm:p-12">
          <CheckCircle2 className="h-11 w-11 text-[#5B824D]" aria-hidden="true" />
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#7059A8]">Application received</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950">You&apos;re in the review queue.</h1>
          <p className="mt-5 text-base leading-7 text-slate-600">Thank you for sharing your company details. The Realty News Now team will review your application and contact you using the information provided.</p>
          <Link href="/agents" className="mt-8 inline-flex min-h-[46px] items-center gap-2 rounded-full bg-[#301D5D] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#513A85]">
            Return to Agent Command Center <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F7F5F1]">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 lg:py-14">
        <Link href="/agents#referral-network" className="inline-flex min-h-[42px] items-center gap-2 text-sm font-bold text-[#301D5D] hover:text-[#5B438C]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Agent Command Center
        </Link>
        <div className="mt-7 grid overflow-hidden border border-[#D8D0C2] bg-white shadow-[0_18px_45px_rgba(40,25,77,0.08)] lg:grid-cols-[0.72fr_1.28fr]">
          <aside className="bg-[#301D5D] p-7 text-white sm:p-9">
            <ShieldCheck className="h-10 w-10 text-[#F4D06F]" aria-hidden="true" />
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-[#F4D06F]">Referral Network</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Put your service in front of local agents.</h1>
            <p className="mt-5 text-sm leading-6 text-white/75">Apply for a featured referral-network profile across the Realty News Now agent community. Your information is reviewed before anything is published.</p>
            <ul className="mt-8 space-y-3 border-t border-white/15 pt-6 text-sm leading-6 text-white/75">
              <li>Service categories and local coverage</li>
              <li>License and insurance review fields</li>
              <li>Direct contact details for agent connection</li>
            </ul>
          </aside>

          <form onSubmit={submit} className="p-6 sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7059A8]">Provider application</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Tell us about your company.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">Fields marked required are used for review. Do not submit sensitive documents or policy files through this form.</p>

            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              <Field label="Company name" required><input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className={INPUT} /></Field>
              <Field label="Primary contact" required><input required value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={INPUT} /></Field>
              <Field label="Work email" required><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} /></Field>
              <Field label="Work phone" required><input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT} /></Field>
              <Field label="Company website"><input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className={INPUT} placeholder="https://" /></Field>
              <Field label="Service areas" required><input required value={form.serviceAreas} onChange={(e) => setForm({ ...form, serviceAreas: e.target.value })} className={INPUT} placeholder="Austin, Round Rock, Cedar Park" /></Field>
            </div>

            <fieldset className="mt-7">
              <legend className="text-sm font-semibold text-slate-800">Service categories <span className="text-[#B45309]">*</span></legend>
              <p className="mt-1 text-xs text-slate-500">Choose up to four categories.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {REFERRAL_PROVIDER_CATEGORIES.map((category) => {
                  const active = form.categories.includes(category);
                  return <button key={category} type="button" onClick={() => toggleCategory(category)} className={`min-h-[42px] rounded-full border px-3.5 py-2 text-sm font-semibold transition ${active ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-[#301D5D]'}`}>{category}</button>;
                })}
              </div>
            </fieldset>

            <div className="mt-8 border-t border-slate-200 pt-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7059A8]">Credentials and coverage</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Optional details help the team complete an initial eligibility review. A completed application does not create a listing or endorsement.</p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field label="License number"><input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} className={INPUT} /></Field>
                <Field label="License state"><input value={form.licenseState} onChange={(e) => setForm({ ...form, licenseState: e.target.value })} className={INPUT} /></Field>
                <Field label="License expiration"><input type="date" value={form.licenseExpiresOn} onChange={(e) => setForm({ ...form, licenseExpiresOn: e.target.value })} className={INPUT} /></Field>
                <Field label="License verification link"><input type="url" value={form.licenseVerificationUrl} onChange={(e) => setForm({ ...form, licenseVerificationUrl: e.target.value })} className={INPUT} placeholder="https://" /></Field>
                <Field label="Insurance carrier"><input value={form.insuranceCarrier} onChange={(e) => setForm({ ...form, insuranceCarrier: e.target.value })} className={INPUT} /></Field>
                <Field label="Insurance expiration"><input type="date" value={form.insuranceExpiresOn} onChange={(e) => setForm({ ...form, insuranceExpiresOn: e.target.value })} className={INPUT} /></Field>
              </div>
              <Field label="Coverage or credential notes" className="mt-5"><textarea value={form.coverageNotes} onChange={(e) => setForm({ ...form, coverageNotes: e.target.value })} rows={3} className={`${INPUT} py-3`} /></Field>
            </div>

            <Field label="Anything else the review team should know?" className="mt-7"><textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} className={`${INPUT} py-3`} /></Field>
            <div className="hidden" aria-hidden="true"><label>Leave this blank<input tabIndex={-1} autoComplete="off" value={form.websiteTrap} onChange={(e) => setForm({ ...form, websiteTrap: e.target.value })} /></label></div>
            <label className="mt-6 flex gap-3 text-sm leading-6 text-slate-600"><input required type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-1 h-4 w-4 accent-[#301D5D]" /><span>I confirm the information is accurate and authorize Realty News Now to contact me about the referral network and featured-partner options.</span></label>
            {error && <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <button disabled={status === 'submitting'} type="submit" className="mt-7 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#301D5D] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#513A85] disabled:cursor-not-allowed disabled:opacity-60">
              {status === 'submitting' ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Submitting application</> : <>Submit for review <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={`block ${className}`}><span className="mb-2 block text-sm font-semibold text-slate-800">{label}{required && <span className="text-[#B45309]"> *</span>}</span>{children}</label>;
}
