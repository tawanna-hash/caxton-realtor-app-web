'use client';

// app/admin/billing/sign/[token]/SignWizard.tsx
//
// 5-step public sign wizard for the Advertising Agreement.
// Step 1: Welcome
// Step 2: Verify Advertiser Info
// Step 3: Review Insertion Order
// Step 4: Review Billing & Payment
// Step 5: Terms & Sign

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Agreement } from '@/lib/agreements';
import { TERMS_RL } from '@/lib/agreement-terms';

const ACCENT = '#D22531';

// ── Helpers ──────────────────────────────────────────────────────────────────

function humanDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function fmt$(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

// ── StepIndicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              i + 1 < current
                ? 'text-white'
                : i + 1 === current
                  ? 'text-white'
                  : 'bg-gray-200 text-gray-500'
            }`}
            style={i + 1 <= current ? { background: ACCENT } : undefined}
          >
            {i + 1 < current ? '✓' : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-8 ${i + 1 < current ? '' : 'bg-gray-200'}`}
              style={i + 1 < current ? { background: ACCENT } : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Layout shell ─────────────────────────────────────────────────────────────

function Shell({ children, step, onBack, onNext, nextLabel, nextDisabled, saving }:
  {
    children: React.ReactNode;
    step: number;
    onBack?: () => void;
    onNext?: () => void;
    nextLabel?: string;
    nextDisabled?: boolean;
    saving?: boolean;
  }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-2xl">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div
            className="inline-block px-4 py-1 rounded text-white text-xs font-bold tracking-[0.2em] uppercase mb-3"
            style={{ background: ACCENT }}
          >
            RealtyLine
          </div>
          <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
            Advertising Agreement
          </h1>
          <p className="text-sm text-gray-500 mt-1">Secure digital signing powered by RealtyLine</p>
        </div>

        <StepIndicator current={step} total={5} />

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          {children}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          {onBack ? (
            <button
              onClick={onBack}
              className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
            >
              ← Back
            </button>
          ) : <div />}
          {onNext && (
            <button
              onClick={onNext}
              disabled={nextDisabled || saving}
              style={{ background: nextDisabled || saving ? undefined : ACCENT }}
              className={`px-6 py-2 rounded text-white text-sm font-medium transition-opacity ${
                nextDisabled || saving ? 'bg-gray-300 cursor-not-allowed' : 'hover:opacity-90'
              }`}
            >
              {saving ? 'Saving…' : (nextLabel ?? 'Continue →')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Field display ─────────────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-0.5">{label}</div>
      <div className="text-sm text-gray-900">{value}</div>
    </div>
  );
}

function EditableField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
      />
    </label>
  );
}

// ── Month badge ───────────────────────────────────────────────────────────────

function MonthBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white mr-1 mb-1"
      style={{ background: ACCENT }}
    >
      {label}
    </span>
  );
}

// ── Main SignWizard ───────────────────────────────────────────────────────────

export default function SignWizard({ ag, token }: { ag: Agreement; token: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Editable advertiser fields
  const [companyName, setCompanyName] = useState(ag.company_name ?? '');
  const [repName, setRepName] = useState(ag.rep_name ?? '');
  const [email, setEmail] = useState(ag.advertiser_email ?? '');
  const [phone, setPhone] = useState(ag.advertiser_phone ?? '');
  const [address, setAddress] = useState(ag.address ?? '');
  const [city, setCity] = useState(ag.city ?? '');
  const [stateVal, setStateVal] = useState(ag.state ?? '');
  const [zip, setZip] = useState(ag.zip ?? '');

  // CC confirm
  const [cardConfirmed, setCardConfirmed] = useState(false);
  const isCreditCard = !!ag.card_type;

  // Sign step
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signerName, setSignerName] = useState(ag.rep_name ?? '');
  const [signDate, setSignDate] = useState(new Date().toISOString().slice(0, 10));

  const saveEdits = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sign/${token}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName || null,
          rep_name: repName || null,
          advertiser_email: email || null,
          advertiser_phone: phone || null,
          address: address || null,
          city: city || null,
          state: stateVal || null,
          zip: zip || null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }, [token, companyName, repName, email, phone, address, city, stateVal, zip]);

  const submitSignature = useCallback(async () => {
    if (!termsAccepted || !signerName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signerName: signerName.trim(), signedAt: signDate, termsAccepted: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push(`/admin/billing/sign/${token}/done?id=${ag.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'signing failed');
    } finally {
      setSaving(false);
    }
  }, [token, termsAccepted, signerName, signDate, router, ag.id]);

  // ─── Step 1: Welcome ─────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <Shell step={1} onNext={() => setStep(2)}>
        <div className="text-center space-y-4">
          <div className="text-5xl">📋</div>
          <h2 className="text-xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
            Welcome, {ag.rep_name ?? 'Advertiser'}
          </h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
            You&apos;re about to sign an <strong>Advertising Agreement</strong> with{' '}
            <strong>RealtyLine</strong> for{' '}
            <strong>{ag.company_name ?? 'your company'}</strong>.
          </p>
          <div
            className="inline-block rounded-lg border-l-4 p-4 text-left text-sm text-gray-700 bg-amber-50 border-amber-400 max-w-md"
          >
            <p className="font-semibold mb-1">⚠️ Legal Notice</p>
            <p>
              This is a legally binding digital signature. By completing this process, you agree to the
              terms and conditions of the advertising agreement.
            </p>
          </div>
          <p className="text-xs text-gray-400">
            This wizard takes approximately 2 minutes to complete.
          </p>
        </div>
      </Shell>
    );
  }

  // ─── Step 2: Verify Advertiser Info ──────────────────────────────────────

  if (step === 2) {
    return (
      <Shell
        step={2}
        onBack={() => setStep(1)}
        onNext={editMode ? undefined : () => setStep(3)}
        nextLabel="Looks correct →"
        saving={saving}
      >
        <div className="space-y-4">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Advertiser Information
          </div>
          <h2 className="text-lg text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
            Verify your information
          </h2>
          <p className="text-sm text-gray-600">Please confirm your advertiser details are correct.</p>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded p-3">{error}</div>}

          {editMode ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <EditableField label="Company Name" value={companyName} onChange={setCompanyName} />
                <EditableField label="Representative Name" value={repName} onChange={setRepName} />
                <EditableField label="Email" value={email} onChange={setEmail} />
                <EditableField label="Phone" value={phone} onChange={setPhone} />
                <EditableField label="Address" value={address} onChange={setAddress} />
                <EditableField label="City" value={city} onChange={setCity} />
                <EditableField label="State" value={stateVal} onChange={setStateVal} />
                <EditableField label="Zip" value={zip} onChange={setZip} />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEditMode(false)}
                  className="px-3 py-1.5 rounded border border-gray-300 text-sm text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdits}
                  disabled={saving}
                  className="px-4 py-1.5 rounded text-white text-sm"
                  style={{ background: ACCENT }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <ReadField label="Company" value={companyName} />
                <ReadField label="Representative" value={repName} />
                <ReadField label="Email" value={email} />
                <ReadField label="Phone" value={phone} />
                <ReadField label="Address" value={address} />
                <ReadField label="City / State / Zip" value={[city, stateVal, zip].filter(Boolean).join(', ')} />
              </div>
              <button
                onClick={() => setEditMode(true)}
                className="text-sm text-blue-600 hover:underline"
              >
                ✏️ Edit this information
              </button>
            </div>
          )}

          {!editMode && (
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setStep(3)}
                className="px-6 py-2 rounded text-white text-sm font-medium hover:opacity-90"
                style={{ background: ACCENT }}
              >
                Looks correct →
              </button>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ─── Step 3: Review Insertion Order ─────────────────────────────────────

  if (step === 3) {
    const timingMonths = ag.ad_timing_months
      ? Object.entries(ag.ad_timing_months)
          .filter(([, y]) => y)
          .map(([m, y]) => `${m.charAt(0).toUpperCase() + m.slice(1)} ${y}`)
      : [];

    return (
      <Shell step={3} onBack={() => setStep(2)} onNext={() => setStep(4)} nextLabel="Next →">
        <div className="space-y-4">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">
            Insertion Order
          </div>
          <h2 className="text-lg text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
            Review your ad details
          </h2>

          <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <ReadField label="Ad Size" value={ag.ad_size} />
            <ReadField label="Frequency" value={ag.frequency} />

            {timingMonths.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-1">Ad Timing</div>
                <div>{timingMonths.map((m) => <MonthBadge key={m} label={m} />)}</div>
              </div>
            )}

            <ReadField label="Ad Rate" value={fmt$(ag.ad_rate_cents)} />
            {ag.discount_cents != null && ag.discount_cents > 0 && (
              <ReadField label="Discount" value={fmt$(ag.discount_cents)} />
            )}
            {ag.ad_premium_cents != null && ag.ad_premium_cents > 0 && (
              <ReadField label="Page Position Premium" value={fmt$(ag.ad_premium_cents)} />
            )}
            {ag.total_monthly_rate_cents != null && (
              <div>
                <div className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-0.5">
                  Total Monthly Rate
                </div>
                <div className="text-base font-bold text-gray-900">{fmt$(ag.total_monthly_rate_cents)}</div>
              </div>
            )}
            {ag.exp_date && <ReadField label="Agreement Expiration" value={humanDate(ag.exp_date)} />}
          </div>
        </div>
      </Shell>
    );
  }

  // ─── Step 4: Review Billing & Payment ────────────────────────────────────

  if (step === 4) {
    return (
      <Shell
        step={4}
        onBack={() => setStep(3)}
        onNext={() => setStep(5)}
        nextDisabled={isCreditCard && !cardConfirmed}
        nextLabel="Next →"
      >
        <div className="space-y-4">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">
            Billing &amp; Payment
          </div>
          <h2 className="text-lg text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
            Review billing information
          </h2>

          <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <ReadField label="Bill To" value={ag.bill_to} />
            <ReadField label="Billing Email" value={ag.billing_email} />
            <ReadField label="Billing Contact" value={ag.billing_contact_name} />
            <ReadField label="Payment Type" value={ag.card_type ? 'Credit Card' : 'Check'} />
            {ag.card_type && (
              <>
                <ReadField label="Card Type" value={ag.card_type} />
                {ag.cardholder_name && <ReadField label="Cardholder" value={ag.cardholder_name} />}
                {ag.card_number_last4 && <ReadField label="Card Last 4" value={`••••${ag.card_number_last4}`} />}
                {ag.card_expiration && <ReadField label="Expiration" value={ag.card_expiration} />}
              </>
            )}
          </div>

          {isCreditCard && (
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded border border-amber-200 bg-amber-50">
              <input
                type="checkbox"
                checked={cardConfirmed}
                onChange={(e) => setCardConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-red-600 flex-shrink-0"
              />
              <span className="text-sm text-amber-800">
                I confirm that the credit card on file is current and authorized for monthly advertising charges.
              </span>
            </label>
          )}
        </div>
      </Shell>
    );
  }

  // ─── Step 5: Terms & Sign ─────────────────────────────────────────────────

  const canSign = termsAccepted && signerName.trim() !== '' && signDate !== '';

  return (
    <Shell
      step={5}
      onBack={() => setStep(4)}
      onNext={submitSignature}
      nextLabel="Sign Agreement"
      nextDisabled={!canSign}
      saving={saving}
    >
      <div className="space-y-5">
        <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">
          Terms &amp; Digital Signature
        </div>
        <h2 className="text-lg text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
          Review &amp; sign the agreement
        </h2>

        {error && <div className="text-sm text-red-600 bg-red-50 rounded p-3">{error}</div>}

        {/* Scrollable terms */}
        <div className="h-52 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
          {TERMS_RL}
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-red-600 flex-shrink-0"
            required
          />
          <span className="text-sm text-gray-700">
            I have read and accept the Terms &amp; Conditions above. I understand this constitutes a legally binding agreement.
          </span>
        </label>

        <div
          className={`rounded border-2 p-4 space-y-3 transition-colors ${termsAccepted ? 'border-amber-400 bg-amber-50/40' : 'border-gray-200'}`}
        >
          <div className="text-xs text-gray-600 font-medium">Digital Signature</div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Type your full legal name *</div>
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              disabled={!termsAccepted}
              placeholder="Full legal name"
              className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Signature date *</div>
            <input
              type="date"
              value={signDate}
              onChange={(e) => setSignDate(e.target.value)}
              disabled={!termsAccepted}
              className="px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100"
            />
          </div>
        </div>

        {canSign && (
          <p className="text-xs text-gray-500 text-center">
            Clicking &ldquo;Sign Agreement&rdquo; constitutes your legally binding digital signature.
          </p>
        )}
      </div>
    </Shell>
  );
}
