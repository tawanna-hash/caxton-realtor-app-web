'use client';

import { useMemo, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { loadStripe, type Stripe as StripeJS } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import {
  EBLAST_ORDER_MARKETS,
  type EBlast,
  type EblastOrderMarketId,
} from '@/lib/media-kit';

type Publication = EblastOrderMarketId;

type Props = {
  packages: EBlast[];
  initialPackageId?: string;
  initialPublication: Publication;
};

type IntentResponse = {
  clientSecret: string;
  publishableKey: string;
  paymentIntentId: string;
  amountCents: number;
  baseCents: number;
  surchargeCents: number;
};

function packageId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function EblastOrderForm({
  packages,
  initialPackageId,
  initialPublication,
}: Props) {
  const firstPackage = initialPackageId ?? packageId(packages[0]?.name ?? '');
  const [publication, setPublication] = useState<Publication>(initialPublication);
  const availablePackages = useMemo(
    () =>
      packages.filter(
        (pkg) => !pkg.availablePubs || pkg.availablePubs.includes(publication),
      ),
    [packages, publication],
  );
  const [selectedPackageId, setSelectedPackageId] = useState(firstPackage);
  const selectedPackage =
    availablePackages.find((pkg) => packageId(pkg.name) === selectedPackageId) ??
    availablePackages[0];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [subjectLine, setSubjectLine] = useState('');
  const [fromName, setFromName] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [primaryDate, setPrimaryDate] = useState(dateOffset(4));
  const [followupDate, setFollowupDate] = useState('');
  const [notes, setNotes] = useState('');
  const [creativeFile, setCreativeFile] = useState<File | null>(null);
  const [creativeUrl, setCreativeUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [stripePromise, setStripePromise] =
    useState<Promise<StripeJS | null> | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ agreementId: string } | null>(null);

  const baseCents = Math.round(
    (selectedPackage?.priceByPub?.[publication] ?? selectedPackage?.price ?? 0) *
      100,
  );
  const surchargeCents = Math.round(baseCents * 0.03);
  const totalCents = baseCents + surchargeCents;
  const sendCount =
    selectedPackage?.sendsByPub?.[publication] ?? selectedPackage?.sends ?? 1;
  const features =
    selectedPackage?.featuresByPub?.[publication] ??
    selectedPackage?.features ??
    [];

  const validEmail = /.+@.+\..+/.test(email.trim());
  const validDestination = /^https?:\/\//.test(destinationUrl.trim());
  const ready =
    Boolean(selectedPackage) &&
    Boolean(name.trim()) &&
    validEmail &&
    Boolean(company.trim()) &&
    Boolean(subjectLine.trim()) &&
    Boolean(fromName.trim()) &&
    validDestination &&
    Boolean(primaryDate) &&
    termsAccepted &&
    !uploading;

  function changePublication(next: Publication) {
    const market = EBLAST_ORDER_MARKETS.find((candidate) => candidate.id === next);
    if (!market?.checkoutEnabled) return;
    setPublication(next);
    setIntent(null);
    const selectedIsAvailable = packages
      .find((pkg) => packageId(pkg.name) === selectedPackageId)
      ?.availablePubs?.includes(next);
    if (selectedIsAvailable === false) {
      const nextPackage = packages.find(
        (pkg) => !pkg.availablePubs || pkg.availablePubs.includes(next),
      );
      if (nextPackage) setSelectedPackageId(packageId(nextPackage.name));
    }
  }

  async function handleUpload(file: File) {
    setError('');
    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const safeName = `eblast-${Date.now()}.${ext}`;
      const blob = await upload(`ads/self-serve/eblast/${safeName}`, file, {
        access: 'public',
        handleUploadUrl: '/api/checkout/eblast/upload-token',
      });
      setCreativeUrl(blob.url);
      setCreativeFile(file);
    } catch (err) {
      setCreativeFile(null);
      setCreativeUrl('');
      setError(err instanceof Error ? err.message : 'Creative upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function preparePayment() {
    if (!selectedPackage) return;
    setError('');
    try {
      const response = await fetch('/api/checkout/eblast/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package_id: packageId(selectedPackage.name),
          publication,
          name,
          email,
          phone,
          company,
          subject_line: subjectLine,
          from_name: fromName,
          destination_url: destinationUrl,
          preferred_send_dates: [primaryDate, followupDate].filter(Boolean),
          creative_url: creativeUrl || undefined,
          creative_filename: creativeFile?.name || undefined,
          notes,
        }),
      });
      const json = (await response.json()) as
        | IntentResponse
        | { error: string; detail?: string };
      if (!response.ok || !('clientSecret' in json)) {
        throw new Error(
          'detail' in json && json.detail
            ? `${json.error}: ${json.detail}`
            : 'error' in json
              ? json.error
              : 'Could not start payment.',
        );
      }
      setIntent(json);
      setStripePromise(loadStripe(json.publishableKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start payment.');
    }
  }

  if (success) {
    return (
      <section className="rounded-md border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
          Order received
        </p>
        <h2 className="mt-2 text-2xl font-bold text-emerald-950">
          Your e-Blast is pending schedule confirmation.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-emerald-900">
          Your order and payment details were received. We sent confirmation to{' '}
          {email}. Our team will review the campaign details and confirm your
          send date by email.
        </p>
        <p className="mt-4 text-xs text-emerald-800">
          Confirmation #{success.agreementId.slice(0, 8)}
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
      <div className="space-y-6">
        <Section number="1" title="Choose your audience">
          <div className="grid gap-2 sm:grid-cols-2">
            {EBLAST_ORDER_MARKETS.map((pub) => {
              const active = publication === pub.id;
              return (
                <button
                  key={pub.id}
                  type="button"
                  onClick={() => changePublication(pub.id)}
                  aria-pressed={active}
                  disabled={!pub.checkoutEnabled}
                  className={`min-h-20 rounded-md border px-3 py-3 text-left transition ${
                    active
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : !pub.checkoutEnabled
                        ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500'
                      : 'border-gray-300 bg-white text-gray-800 hover:border-brand-700'
                  }`}
                >
                  <span className="flex items-start justify-between gap-2 text-sm font-semibold">
                    <span>{pub.label}</span>
                    {!pub.checkoutEnabled && (
                      <span className="shrink-0 rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-800">
                        Coming soon
                      </span>
                    )}
                  </span>
                  <span
                    className={`mt-1 block text-xs ${
                      active ? 'text-violet-100' : 'text-gray-500'
                    }`}
                  >
                    {pub.audience}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section number="2" title="Choose your package">
          <div className="space-y-3">
            {availablePackages.map((pkg) => {
              const id = packageId(pkg.name);
              const active = id === packageId(selectedPackage?.name ?? '');
              const price = pkg.priceByPub?.[publication] ?? pkg.price;
              const pkgFeatures =
                pkg.featuresByPub?.[publication] ?? pkg.features;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSelectedPackageId(id);
                    setIntent(null);
                  }}
                  aria-pressed={active}
                  className={`w-full rounded-md border p-4 text-left transition ${
                    active
                      ? 'border-brand-700 bg-violet-50 ring-1 ring-brand-700'
                      : 'border-gray-200 bg-white hover:border-brand-700'
                  }`}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-gray-950">{pkg.name}</span>
                    <span className="text-lg font-bold tabular-nums text-brand-700">
                      ${price.toLocaleString()}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-gray-600">
                    Includes {pkg.sendsByPub?.[publication] ?? pkg.sends}{' '}
                    {pkg.sendsByPub?.[publication] === 1 || pkg.sends === 1
                      ? 'send'
                      : 'sends'}
                    {' · '}
                    {pkgFeatures.slice(0, 2).join(' · ')}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section number="3" title="Campaign schedule">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preferred first send date *">
              <Input
                type="date"
                value={primaryDate}
                onChange={setPrimaryDate}
                min={dateOffset(3)}
              />
            </Field>
            <Field label="Preferred follow-up date">
              <Input
                type="date"
                value={followupDate}
                onChange={setFollowupDate}
                min={primaryDate}
              />
            </Field>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-gray-500">
            Your package includes {sendCount} {sendCount === 1 ? 'send' : 'sends'}.
            The follow-up date can be finalized with our team after checkout.
          </p>
        </Section>

        <Section number="4" title="Campaign details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject line *">
              <Input
                value={subjectLine}
                onChange={setSubjectLine}
                maxLength={120}
                placeholder="Your campaign subject line"
              />
            </Field>
            <Field label="From name *">
              <Input
                value={fromName}
                onChange={setFromName}
                maxLength={120}
                placeholder="Your company name"
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Destination URL *">
              <Input
                type="url"
                value={destinationUrl}
                onChange={setDestinationUrl}
                placeholder="https://your-company.com/campaign"
              />
            </Field>
          </div>
          <div className="mt-4">
            <span className="mb-1 block text-xs font-medium text-gray-700">
              Creative file
            </span>
            {creativeUrl ? (
              <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                <span className="min-w-0 truncate text-sm text-gray-800">
                  {creativeFile?.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCreativeFile(null);
                    setCreativeUrl('');
                  }}
                  className="min-h-11 rounded-md border border-brand-700 px-3 text-sm font-semibold text-brand-700"
                >
                  Replace
                </button>
              </div>
            ) : (
              <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center hover:border-brand-700">
                <input
                  type="file"
                  className="sr-only"
                  accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/html,application/zip"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleUpload(file);
                  }}
                />
                <span className="text-sm font-semibold text-gray-800">
                  {uploading ? 'Uploading creative…' : 'Upload image, PDF, HTML, or ZIP'}
                </span>
                <span className="mt-1 text-xs text-gray-500">
                  Optional at checkout · maximum 10 MB
                </span>
              </label>
            )}
          </div>
          <div className="mt-4">
            <Field label="Campaign notes">
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Audience instructions, timing notes, or creative details"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-700 focus:ring-1 focus:ring-brand-700"
              />
            </Field>
          </div>
        </Section>

        <Section number="5" title="Your information">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name *">
              <Input value={name} onChange={setName} placeholder="Jane Smith" />
            </Field>
            <Field label="Company *">
              <Input
                value={company}
                onChange={setCompany}
                placeholder="Company or organization"
              />
            </Field>
            <Field label="Email *">
              <Input
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="jane@company.com"
              />
            </Field>
            <Field label="Phone">
              <Input
                type="tel"
                value={phone}
                onChange={setPhone}
                placeholder="(512) 555-1234"
              />
            </Field>
          </div>
        </Section>

        <Section number="6" title="Terms and payment">
          <div className="max-h-44 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-gray-700">
            <p>
              <strong>Self-Service e-Blast Order.</strong> Creative and requested
              dates remain subject to Publisher approval. If the requested date
              is unavailable, Publisher will offer the nearest available date.
              Advertiser confirms it owns or is authorized to use all submitted
              content, links, trademarks, and images. Payment is charged at
              checkout. If Publisher cannot fulfill the order, Publisher will
              provide a replacement date or refund the unfulfilled placement.
              Performance, opens, clicks, and conversions are not guaranteed.
            </p>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-700 focus:ring-brand-700"
            />
            <span className="text-sm text-gray-700">
              I accept these terms and am authorized to place this order for{' '}
              {company || 'my company'}.
            </span>
          </label>

          {!intent ? (
            <div className="mt-5">
              <button
                type="button"
                disabled={!ready}
                onClick={() => void preparePayment()}
                className="min-h-12 w-full rounded-md bg-brand-700 px-5 py-3 font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ready
                  ? `Continue to secure payment · ${formatUsd(totalCents)}`
                  : 'Complete the required fields to continue'}
              </button>
              {!ready && (
                <p className="mt-2 text-xs text-gray-500">
                  Required: audience, package, send date, campaign details,
                  contact information, destination URL, and accepted terms.
                </p>
              )}
            </div>
          ) : stripePromise ? (
            <div className="mt-5">
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret: intent.clientSecret,
                  appearance: { theme: 'stripe', labels: 'floating' },
                }}
              >
                <PaymentBlock
                  intent={intent}
                  onError={setError}
                  onSuccess={(agreementId) => setSuccess({ agreementId })}
                />
              </Elements>
            </div>
          ) : null}
        </Section>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </div>
        )}
      </div>

      <aside className="rounded-md bg-brand-700 p-5 text-white lg:sticky lg:top-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">
          Order summary
        </p>
        <h2 className="mt-2 text-xl font-bold">{selectedPackage?.name}</h2>
        <p className="mt-1 text-sm text-violet-100">
          {EBLAST_ORDER_MARKETS.find((pub) => pub.id === publication)?.label}
        </p>
        <ul className="mt-5 space-y-2 text-sm text-violet-50">
          {features.map((feature) => (
            <li key={feature} className="flex gap-2">
              <span aria-hidden="true" className="text-orange-300">
                •
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-6 space-y-2 border-t border-white/20 pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-violet-200">Package</dt>
            <dd className="tabular-nums">{formatUsd(baseCents)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-violet-200">3% processing</dt>
            <dd className="tabular-nums">{formatUsd(surchargeCents)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-white/20 pt-3 text-lg font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatUsd(totalCents)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-violet-200">
          Secure payment by card or eligible bank account through Stripe.
        </p>
      </aside>
    </div>
  );
}

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-gray-600">
        <span className="mr-2 text-orange-600">{number}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  min,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  min?: string;
  maxLength?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      min={min}
      maxLength={maxLength}
      className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-700 focus:ring-1 focus:ring-brand-700"
    />
  );
}

function PaymentBlock({
  intent,
  onSuccess,
  onError,
}: {
  intent: IntentResponse;
  onSuccess: (agreementId: string) => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  async function pay() {
    if (!stripe || !elements) return;
    setPaying(true);
    onError('');
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        throw new Error(submitError.message ?? 'Payment details are incomplete.');
      }
      const result = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });
      if (result.error) {
        throw new Error(result.error.message ?? 'Payment failed.');
      }
      const response = await fetch('/api/checkout/eblast/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: intent.paymentIntentId }),
      });
      const json = (await response.json()) as {
        ok?: boolean;
        agreementId?: string;
        error?: string;
        detail?: string;
      };
      if (!response.ok || !json.ok || !json.agreementId) {
        throw new Error(json.detail ?? json.error ?? 'Could not save the order.');
      }
      onSuccess(json.agreementId);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Payment failed.');
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="button"
        disabled={paying || !stripe || !elements}
        onClick={() => void pay()}
        className="min-h-12 w-full rounded-md bg-brand-700 px-5 py-3 font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {paying ? 'Processing payment…' : `Pay ${formatUsd(intent.amountCents)}`}
      </button>
      <p className="text-center text-xs text-gray-500">
        Secured by Stripe. Payment details never touch our servers.
      </p>
    </div>
  );
}
