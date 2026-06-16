'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import PageTitle from '@/components/ui/PageTitle';

type Selection = 'realtyline' | 'newslinesa' | 'both' | null;

export default function SubscribePage() {
  const [selection, setSelection] = useState<Selection>(null);
  const formsRef = useRef<HTMLDivElement>(null);

  const realtylineActive = selection === 'realtyline' || selection === 'both';
  const newslineActive = selection === 'newslinesa' || selection === 'both';

  // When user makes a selection, smooth-scroll to the form section
  useEffect(() => {
    if (selection !== null && formsRef.current) {
      formsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selection]);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 md:py-16">
      <header className="mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Subscribe to Print
        </p>
        <PageTitle>
          Subscribe to Print. It&apos;s free!
        </PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl">
          Pick your publication and we&apos;ll mail you every issue, no charge.
        </p>
      </header>

      {/* Picker */}
      <section className="mb-10">
        <p className="text-sm font-semibold text-gray-900 mb-4">
          Which publication?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PickerButton
            label="RealtyLine"
            sublabel="Austin"
            selected={selection === 'realtyline'}
            activeColor="#1a2a44"
            onClick={() => setSelection('realtyline')}
          />
          <PickerButton
            label="Newsline San Antonio"
            sublabel="San Antonio"
            selected={selection === 'newslinesa'}
            activeColor="#3D0740"
            onClick={() => setSelection('newslinesa')}
          />
          <PickerButton
            label="Both"
            sublabel="Austin + San Antonio"
            selected={selection === 'both'}
            activeColor="#374151"
            onClick={() => setSelection('both')}
          />
        </div>
        {selection === null ? (
          <div className="mt-4 flex items-start gap-2 text-sm text-gray-600">
            <span aria-hidden className="mt-0.5">{'\u2193'}</span>
            <p>
              Pick a publication above to reveal the print subscription form.
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-500 mt-3 font-light">
            Fill out the form below to start your free print subscription.
          </p>
        )}
      </section>

      <div ref={formsRef} className="scroll-mt-8">
        {realtylineActive && (
          <SubscribeForm
            publication="RealtyLine"
            market="Austin"
            accentColor="#1a2a44"
            formId="realtyline"
            active={true}
            onActivate={() => {}}
          />
        )}

        {realtylineActive && newslineActive && (
          <hr className="border-gray-200 my-12" />
        )}

        {newslineActive && (
          <SubscribeForm
            publication="Newsline San Antonio"
            market="San Antonio"
            accentColor="#3D0740"
            formId="newslinesa"
            active={true}
            onActivate={() => {}}
          />
        )}
      </div>

      <footer className="mt-12 pt-8 border-t border-gray-200">
        <p className="text-sm text-gray-500 font-light">
          Questions about subscriptions?{' '}
          <a
            href="mailto:hello@myrealtyline.com?subject=Subscription%20Question"
            className="text-[#1a2a44] font-medium underline underline-offset-2"
          >
            hello@myrealtyline.com
          </a>
        </p>
      </footer>
    </main>
  );
}

// -----------------------------------------------------------------------------
// Picker button
// -----------------------------------------------------------------------------

function PickerButton({
  label,
  sublabel,
  selected,
  activeColor,
  onClick,
}: {
  label: string;
  sublabel: string;
  selected: boolean;
  activeColor: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left border-2 px-5 py-4 transition-all"
      style={{
        borderColor: selected ? activeColor : '#d1d5db',
        backgroundColor: selected ? `${activeColor}10` : '#ffffff',
      }}
    >
      <p
        className="text-base font-semibold"
        style={{ color: selected ? activeColor : '#111827' }}
      >
        {label}
      </p>
      <p className="text-xs text-gray-500 mt-0.5 font-light">{sublabel}</p>
    </button>
  );
}

// -----------------------------------------------------------------------------
// Reusable form component
// -----------------------------------------------------------------------------

type FormData = {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  mobile: string;
  title: string;
  licenseType: string;
  licenseNumber: string;
  street: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  birthdayMonth: string;
  birthdayDay: string;
};

const emptyForm: FormData = {
  firstName: '',
  lastName: '',
  company: '',
  email: '',
  mobile: '',
  title: '',
  licenseType: '',
  licenseNumber: '',
  street: '',
  address2: '',
  city: '',
  state: '',
  zip: '',
  birthdayMonth: '',
  birthdayDay: '',
};

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

const fieldStyle =
  'w-full border border-gray-300 px-4 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed';

function SubscribeForm({
  publication,
  market,
  accentColor,
  formId,
  active,
  onActivate,
}: {
  publication: string;
  market: string;
  accentColor: string;
  formId: string;
  active: boolean;
  onActivate: () => void;
}) {
  const [data, setData] = useState<FormData>(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function update(field: keyof FormData, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    if (active) e.currentTarget.style.borderColor = accentColor;
  }

  function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = '#d1d5db';
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!active) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/print-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publication: publication.toLowerCase(),
          ...data,
        }),
      });

      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string }
        | null;

      if (!res.ok || !body?.ok) {
        setErrorMessage(
          body?.error ||
            'Something went wrong on our end. Please try again in a moment.',
        );
        return;
      }

      setSubmitted(true);
    } catch {
      setErrorMessage(
        'We could not reach the server. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section
        className="bg-gray-50 border-l-4 px-6 py-8"
        style={{ borderColor: accentColor }}
      >
        <p
          className="text-sm uppercase tracking-[0.2em] font-medium mb-3"
          style={{ color: accentColor }}
        >
          {publication}
        </p>
        <h2 className="text-2xl font-semibold text-gray-900 mb-3">
          You&apos;re on the list.
        </h2>
        <p className="text-base text-gray-700 font-light leading-relaxed mb-3">
          Thanks, {data.firstName}. We&apos;ve received your
          subscription request for delivery to:
        </p>
        <div className="text-base text-gray-900 font-light pl-4 border-l-2 border-gray-300 mb-4">
          {data.street}
          {data.address2 && (
            <>
              <br />
              {data.address2}
            </>
          )}
          <br />
          {data.city}, {data.state} {data.zip}
        </div>
        <p className="text-base text-gray-700 font-light leading-relaxed">
          We&apos;ll email a confirmation to{' '}
          <span className="font-medium text-gray-900">{data.email}</span> once
          your subscription is set up. Your first issue will arrive within a
          few weeks.
        </p>
        <button
          type="button"
          onClick={() => {
            setData(emptyForm);
            setSubmitted(false);
          }}
          className="mt-5 text-sm font-medium underline underline-offset-2"
          style={{ color: accentColor }}
        >
          Subscribe another household
        </button>
      </section>
    );
  }

  // Ghost (inactive) state — wrap whole form, fade it, and capture clicks to auto-select
  const wrapperClass = active
    ? ''
    : 'opacity-40 pointer-events-none select-none';

  return (
    <div className="relative">
      {!active && (
        <button
          type="button"
          onClick={onActivate}
          className="absolute inset-0 z-10 cursor-pointer bg-transparent"
          aria-label={`Activate ${publication} subscription form`}
        />
      )}
      <section className={wrapperClass}>
        <div className="mb-6">
          <p
            className="text-sm uppercase tracking-[0.2em] font-medium mb-2"
            style={{ color: accentColor }}
          >
            {publication}
          </p>
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 tracking-tight">
            Subscribe to {publication} ({market})
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <FormField
            id={`${formId}-firstName`}
            label="First name"
            value={data.firstName}
            onChange={(v) => update('firstName', v)}
            required
            disabled={!active}
            autoComplete="given-name"
            focusBorder={focusBorder}
            blurBorder={blurBorder}
          />

          <FormField
            id={`${formId}-lastName`}
            label="Last name"
            value={data.lastName}
            onChange={(v) => update('lastName', v)}
            required
            disabled={!active}
            autoComplete="family-name"
            focusBorder={focusBorder}
            blurBorder={blurBorder}
          />

          <FormField
            id={`${formId}-company`}
            label="Company or brokerage"
            value={data.company}
            onChange={(v) => update('company', v)}
            required
            disabled={!active}
            autoComplete="organization"
            focusBorder={focusBorder}
            blurBorder={blurBorder}
          />

          <FormField
            id={`${formId}-email`}
            label="Email"
            type="email"
            value={data.email}
            onChange={(v) => update('email', v)}
            required
            disabled={!active}
            autoComplete="email"
            focusBorder={focusBorder}
            blurBorder={blurBorder}
          />

          <FormField
            id={`${formId}-mobile`}
            label="Mobile"
            type="tel"
            value={data.mobile}
            onChange={(v) => update('mobile', v)}
            required
            disabled={!active}
            autoComplete="tel"
            placeholder="(512) 555-0100"
            focusBorder={focusBorder}
            blurBorder={blurBorder}
          />

          <FormField
            id={`${formId}-title`}
            label="Title"
            value={data.title}
            onChange={(v) => update('title', v)}
            required
            disabled={!active}
            autoComplete="organization-title"
            placeholder="REALTOR®, Loan Officer, Builder, Title Officer…"
            focusBorder={focusBorder}
            blurBorder={blurBorder}
          />

          {/* License (optional, for de-dup) */}
          <fieldset className="space-y-4 border-t border-gray-200 pt-5">
            <legend className="text-sm uppercase tracking-wider font-semibold text-gray-700 mb-2">
              License number
              <span className="text-gray-500 font-normal normal-case ml-2">
                (optional)
              </span>
            </legend>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label
                  htmlFor={`${formId}-licenseType`}
                  className="block text-sm font-medium text-gray-900 mb-1"
                >
                  License type
                </label>
                <select
                  id={`${formId}-licenseType`}
                  disabled={!active}
                  value={data.licenseType}
                  onChange={(e) => {
                    update('licenseType', e.target.value);
                    // Clear the number if type is cleared
                    if (!e.target.value) update('licenseNumber', '');
                  }}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                  className={`${fieldStyle} bg-white`}
                >
                  <option value="">--</option>
                  <option value="TREC">TREC</option>
                  <option value="NMLS">NMLS</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor={`${formId}-licenseNumber`}
                  className="block text-sm font-medium text-gray-900 mb-1"
                >
                  License number
                </label>
                <input
                  id={`${formId}-licenseNumber`}
                  type="text"
                  inputMode="numeric"
                  disabled={!active || !data.licenseType}
                  placeholder={
                    data.licenseType === 'TREC'
                      ? 'e.g., 0654321'
                      : data.licenseType === 'NMLS'
                      ? 'e.g., 1234567'
                      : 'Pick a license type first'
                  }
                  value={data.licenseNumber}
                  onChange={(e) => update('licenseNumber', e.target.value)}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                  className={fieldStyle}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 font-light italic">
              Helps us avoid sending duplicate copies to the same person.
            </p>
          </fieldset>

          {/* Mailing address fieldset */}
          <fieldset className="space-y-4 border-t border-gray-200 pt-5">
            <legend className="text-sm uppercase tracking-wider font-semibold text-gray-700 mb-2">
              Mailing address
            </legend>

            <FormField
              id={`${formId}-street`}
              label="Mailing address"
              value={data.street}
              onChange={(v) => update('street', v)}
              required
              disabled={!active}
              autoComplete="street-address"
              focusBorder={focusBorder}
              blurBorder={blurBorder}
            />

            <FormField
              id={`${formId}-address2`}
              label="Mailing address 2"
              suffix="(optional — apt, suite, unit)"
              value={data.address2}
              onChange={(v) => update('address2', v)}
              disabled={!active}
              autoComplete="address-line2"
              focusBorder={focusBorder}
              blurBorder={blurBorder}
            />

            <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
              <div className="sm:col-span-3">
                <FormField
                  id={`${formId}-city`}
                  label="City"
                  value={data.city}
                  onChange={(v) => update('city', v)}
                  required
                  disabled={!active}
                  autoComplete="address-level2"
                  focusBorder={focusBorder}
                  blurBorder={blurBorder}
                />
              </div>

              <div className="sm:col-span-1">
                <label
                  htmlFor={`${formId}-state`}
                  className="block text-sm font-medium text-gray-900 mb-1"
                >
                  State <span className="text-red-600">*</span>
                </label>
                <select
                  id={`${formId}-state`}
                  required
                  disabled={!active}
                  autoComplete="address-level1"
                  value={data.state}
                  onChange={(e) => update('state', e.target.value)}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                  className={`${fieldStyle} bg-white`}
                >
                  <option value="">--</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <FormField
                  id={`${formId}-zip`}
                  label="ZIP code"
                  value={data.zip}
                  onChange={(v) => update('zip', v)}
                  required
                  disabled={!active}
                  autoComplete="postal-code"
                  pattern="^\d{5}(-\d{4})?$"
                  inputMode="numeric"
                  placeholder="78701"
                  focusBorder={focusBorder}
                  blurBorder={blurBorder}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 font-light italic">
              US addresses only. Address will be verified before mailing.
            </p>
          </fieldset>

          {/* Birthday fieldset */}
          <fieldset className="space-y-4 border-t border-gray-200 pt-5">
            <legend className="text-sm uppercase tracking-wider font-semibold text-gray-700 mb-2">
              Birthday
            </legend>

            <div className="grid grid-cols-2 gap-4 max-w-xs">
              <FormField
                id={`${formId}-bmonth`}
                label="Month"
                value={data.birthdayMonth}
                onChange={(v) => update('birthdayMonth', v)}
                required
                disabled={!active}
                pattern="^(0?[1-9]|1[0-2])$"
                inputMode="numeric"
                placeholder="MM"
                maxLength={2}
                focusBorder={focusBorder}
                blurBorder={blurBorder}
              />
              <FormField
                id={`${formId}-bday`}
                label="Day"
                value={data.birthdayDay}
                onChange={(v) => update('birthdayDay', v)}
                required
                disabled={!active}
                pattern="^(0?[1-9]|[12][0-9]|3[01])$"
                inputMode="numeric"
                placeholder="DD"
                maxLength={2}
                focusBorder={focusBorder}
                blurBorder={blurBorder}
              />
            </div>

            <p className="text-xs text-gray-500 font-light italic">
              We don&apos;t need the year — just month and day.
            </p>
          </fieldset>

          {errorMessage && (
            <div
              role="alert"
              className="border-l-4 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              {errorMessage}
            </div>
          )}

          {/* Submit */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={!active || submitting}
              className="w-full sm:w-auto px-8 py-3 text-base font-semibold text-white tracking-wide transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: accentColor }}
            >
              {submitting
                ? 'Submitting…'
                : `Start my free ${publication} subscription`}
            </button>
          </div>

          <p className="text-xs text-gray-500 font-light leading-relaxed pt-2">
            We use your information only to deliver {publication} and send
            subscription-related communications. See our{' '}
            <a
              href="/privacy"
              className="font-medium underline underline-offset-2"
              style={{ color: accentColor }}
            >
              Privacy Notice
            </a>{' '}
            — we never sell or share subscriber information.
          </p>
        </form>
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Reusable form field
// -----------------------------------------------------------------------------

function FormField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  disabled = false,
  autoComplete,
  placeholder,
  pattern,
  inputMode,
  maxLength,
  suffix,
  focusBorder,
  blurBorder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  placeholder?: string;
  pattern?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email' | 'url';
  maxLength?: number;
  suffix?: string;
  focusBorder: (e: React.FocusEvent<HTMLInputElement>) => void;
  blurBorder: (e: React.FocusEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-900 mb-1"
      >
        {label} {required && <span className="text-red-600">*</span>}
        {suffix && (
          <span className="text-gray-500 font-normal ml-2">{suffix}</span>
        )}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        pattern={pattern}
        inputMode={inputMode}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={focusBorder}
        onBlur={blurBorder}
        className={fieldStyle}
      />
    </div>
  );
}
