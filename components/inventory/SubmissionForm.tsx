'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { BUILDER_CLIENTS } from '@/lib/builder-clients';

type Kind = 'listing' | 'promotion';
type Publication = 'realtyline' | 'newsline' | 'both';
const fieldStyle =
  'w-full border border-gray-300 px-4 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed';
const labelStyle = 'block text-sm font-medium text-gray-900 mb-1.5';
const helpStyle = 'mt-1 text-xs text-gray-500 font-light';

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

export default function SubmissionForm() {
  const [kind, setKind] = useState<Kind>('listing');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Shared fields
  const [builderValue, setBuilderValue] = useState<string>('');
  const [builderOther, setBuilderOther] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('TX');
  const [publication, setPublication] = useState<Publication>('both');
  const [description, setDescription] = useState<string>('');

  // Submitter
  const [submitterName, setSubmitterName] = useState<string>('');
  const [submitterEmail, setSubmitterEmail] = useState<string>('');
  const [submitterPhone, setSubmitterPhone] = useState<string>('');

  // Listing fields
  const [bedsMin, setBedsMin] = useState<string>('');
  const [bedsMax, setBedsMax] = useState<string>('');
  const [bathsMin, setBathsMin] = useState<string>('');
  const [bathsMax, setBathsMax] = useState<string>('');
  const [sqftMin, setSqftMin] = useState<string>('');
  const [sqftMax, setSqftMax] = useState<string>('');
  const [priceMin, setPriceMin] = useState<string>('');
  const [priceMax, setPriceMax] = useState<string>('');

  // Promotion fields
  const [expiresAt, setExpiresAt] = useState<string>('');

  // PDF
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  function onPdfChange(e: ChangeEvent<HTMLInputElement>) {
    setPdfError(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setPdfFile(null);
      return;
    }
    if (f.type !== 'application/pdf') {
      setPdfError('File must be a PDF.');
      setPdfFile(null);
      return;
    }
    if (f.size > MAX_PDF_BYTES) {
      setPdfError('PDF must be under 25 MB.');
      setPdfFile(null);
      return;
    }
    setPdfFile(f);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const builderName =
        builderValue === 'other'
          ? builderOther.trim()
          : (BUILDER_CLIENTS.find((b) => b.value === builderValue)?.label ?? '');

      if (!builderName) {
        throw new Error('Please choose a builder/developer.');
      }
      if (!pdfFile) {
        throw new Error('Please attach the flyer as a PDF.');
      }

      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('publication', publication);
      fd.append('submittedByName', submitterName);
      fd.append('submittedByEmail', submitterEmail);
      if (submitterPhone) fd.append('submittedByPhone', submitterPhone);
      fd.append('builderName', builderName);
      fd.append('title', title);
      fd.append('city', city);
      fd.append('state', state);
      if (description) fd.append('description', description);

      if (kind === 'listing') {
        if (bedsMin) fd.append('bedsMin', bedsMin);
        if (bedsMax) fd.append('bedsMax', bedsMax);
        if (bathsMin) fd.append('bathsMin', bathsMin);
        if (bathsMax) fd.append('bathsMax', bathsMax);
        if (sqftMin) fd.append('sqftMin', sqftMin);
        if (sqftMax) fd.append('sqftMax', sqftMax);
        if (priceMin) fd.append('priceMin', priceMin);
        if (priceMax) fd.append('priceMax', priceMax);
      } else {
        if (expiresAt) fd.append('expiresAt', expiresAt);
      }

      fd.append('flyerPdf', pdfFile);

      const res = await fetch('/api/inventory/submit', {
        method: 'POST',
        body: fd,
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
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'We could not reach the server. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section
        className="bg-gray-50 border-l-4 border-gray-900 px-6 py-8"
      >
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
          Submission received
        </p>
        <h2 className="text-2xl font-semibold text-gray-900 mb-3">
          Thank you, {submitterName.split(' ')[0] || 'partner'}.
        </h2>
        <p className="text-base text-gray-700 font-light leading-relaxed mb-3">
          Your {kind === 'listing' ? 'listing' : 'promotion'} has been received and is in our review queue. The editorial team will publish it after a final pass — typically within one business day.
        </p>
        <p className="text-base text-gray-700 font-light leading-relaxed">
          A confirmation has been emailed to <span className="font-medium text-gray-900">{submitterEmail}</span>.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Kind toggle */}
      <div>
        <label className={labelStyle}>What are you submitting?</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setKind('listing')}
            className={
              'border px-4 py-3 text-left transition-colors ' +
              (kind === 'listing'
                ? 'border-gray-900 bg-gray-50'
                : 'border-gray-300 bg-white hover:border-gray-400')
            }
            aria-pressed={kind === 'listing'}
          >
            <p className="font-medium text-gray-900">A listing</p>
            <p className="text-sm text-gray-600 font-light mt-0.5">
              Specific homes available now or coming soon
            </p>
          </button>
          <button
            type="button"
            onClick={() => setKind('promotion')}
            className={
              'border px-4 py-3 text-left transition-colors ' +
              (kind === 'promotion'
                ? 'border-gray-900 bg-gray-50'
                : 'border-gray-300 bg-white hover:border-gray-400')
            }
            aria-pressed={kind === 'promotion'}
          >
            <p className="font-medium text-gray-900">A promotion</p>
            <p className="text-sm text-gray-600 font-light mt-0.5">
              Incentives, events, or limited-time offers
            </p>
          </button>
        </div>
      </div>

      {/* Builder dropdown */}
      <div>
        <label htmlFor="builder" className={labelStyle}>
          Builder or developer <span className="text-red-600">*</span>
        </label>
        <select
          id="builder"
          required
          disabled={submitting}
          value={builderValue}
          onChange={(e) => setBuilderValue(e.target.value)}
          className={fieldStyle}
        >
          <option value="" disabled>
            Choose a builder or developer…
          </option>
          {BUILDER_CLIENTS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        {builderValue === 'other' && (
          <input
            type="text"
            required
            disabled={submitting}
            placeholder="Name of builder/developer"
            value={builderOther}
            onChange={(e) => setBuilderOther(e.target.value)}
            className={`${fieldStyle} mt-2`}
          />
        )}
      </div>

      {/* Title / Community name */}
      <div>
        <label htmlFor="title" className={labelStyle}>
          {kind === 'listing' ? 'Community name' : 'Promotion title'}{' '}
          <span className="text-red-600">*</span>
        </label>
        <input
          id="title"
          type="text"
          required
          disabled={submitting}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            kind === 'listing'
              ? 'e.g., Sunfield Crossing'
              : 'e.g., 5.25% rate buydown through June 30'
          }
          className={fieldStyle}
        />
      </div>

      {/* City + State */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label htmlFor="city" className={labelStyle}>
            City <span className="text-red-600">*</span>
          </label>
          <input
            id="city"
            type="text"
            required
            disabled={submitting}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g., Buda"
            className={fieldStyle}
          />
        </div>
        <div>
          <label htmlFor="state" className={labelStyle}>
            State
          </label>
          <input
            id="state"
            type="text"
            disabled={submitting}
            value={state}
            onChange={(e) => setState(e.target.value)}
            maxLength={2}
            className={fieldStyle}
          />
        </div>
      </div>

      {/* Publication */}
      <div>
        <label htmlFor="publication" className={labelStyle}>
          Which publication(s)? <span className="text-red-600">*</span>
        </label>
        <select
          id="publication"
          required
          disabled={submitting}
          value={publication}
          onChange={(e) => setPublication(e.target.value as Publication)}
          className={fieldStyle}
        >
          <option value="both">Both (RealtyLine + Newsline San Antonio)</option>
          <option value="realtyline">RealtyLine Austin only</option>
          <option value="newsline">Newsline San Antonio only</option>
        </select>
        <p className={helpStyle}>
          Choose where this submission should appear. Builders marketing only to one metro should pick that publication.
        </p>
      </div>

      {/* Listing-only fields */}
      {kind === 'listing' && (
        <div className="border-t border-gray-200 pt-6 space-y-5">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">
            Listing details <span className="text-gray-400 normal-case tracking-normal">(optional)</span>
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bedsMin" className={labelStyle}>Beds (min)</label>
              <input id="bedsMin" type="number" min="0" max="20" disabled={submitting} value={bedsMin} onChange={(e) => setBedsMin(e.target.value)} className={fieldStyle} />
            </div>
            <div>
              <label htmlFor="bedsMax" className={labelStyle}>Beds (max)</label>
              <input id="bedsMax" type="number" min="0" max="20" disabled={submitting} value={bedsMax} onChange={(e) => setBedsMax(e.target.value)} className={fieldStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="bathsMin" className={labelStyle}>Baths (min)</label>
              <input id="bathsMin" type="number" min="0" max="20" step="0.5" disabled={submitting} value={bathsMin} onChange={(e) => setBathsMin(e.target.value)} className={fieldStyle} />
            </div>
            <div>
              <label htmlFor="bathsMax" className={labelStyle}>Baths (max)</label>
              <input id="bathsMax" type="number" min="0" max="20" step="0.5" disabled={submitting} value={bathsMax} onChange={(e) => setBathsMax(e.target.value)} className={fieldStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sqftMin" className={labelStyle}>Sqft (min)</label>
              <input id="sqftMin" type="number" min="0" disabled={submitting} value={sqftMin} onChange={(e) => setSqftMin(e.target.value)} className={fieldStyle} placeholder="1720" />
            </div>
            <div>
              <label htmlFor="sqftMax" className={labelStyle}>Sqft (max)</label>
              <input id="sqftMax" type="number" min="0" disabled={submitting} value={sqftMax} onChange={(e) => setSqftMax(e.target.value)} className={fieldStyle} placeholder="2890" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="priceMin" className={labelStyle}>Price (min, $)</label>
              <input id="priceMin" type="number" min="0" disabled={submitting} value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className={fieldStyle} placeholder="315000" />
            </div>
            <div>
              <label htmlFor="priceMax" className={labelStyle}>Price (max, $)</label>
              <input id="priceMax" type="number" min="0" disabled={submitting} value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className={fieldStyle} placeholder="448000" />
            </div>
          </div>
        </div>
      )}

      {/* Promotion-only fields */}
      {kind === 'promotion' && (
        <div className="border-t border-gray-200 pt-6 space-y-5">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">
            Promotion details
          </p>

          <div>
            <label htmlFor="expiresAt" className={labelStyle}>
              Expiration date
            </label>
            <input
              id="expiresAt"
              type="date"
              disabled={submitting}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={fieldStyle}
            />
            <p className={helpStyle}>
              Leave blank if the promotion is ongoing. We will auto-archive expired promotions.
            </p>
          </div>
        </div>
      )}

      {/* Description */}
      <div>
        <label htmlFor="description" className={labelStyle}>
          Description
        </label>
        <textarea
          id="description"
          disabled={submitting}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={fieldStyle}
          placeholder={
            kind === 'listing'
              ? 'Brief description of the community, key features, or what realtors should know.'
              : 'Details about the promotion: who qualifies, terms, when it applies.'
          }
        />
      </div>

      {/* Flyer PDF */}
      <div>
        <label htmlFor="flyerPdf" className={labelStyle}>
          Flyer PDF (letter size recommended) <span className="text-red-600">*</span>
        </label>
        <input
          id="flyerPdf"
          type="file"
          accept="application/pdf"
          required
          disabled={submitting}
          onChange={onPdfChange}
          className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-900 hover:file:bg-gray-50 disabled:opacity-50"
        />
        <p className={helpStyle}>
          Max 25 MB. We will generate a thumbnail and host the full flyer for realtors to view.
        </p>
        {pdfError && (
          <p className="mt-1 text-sm text-red-700">{pdfError}</p>
        )}
        {pdfFile && !pdfError && (
          <p className="mt-1 text-sm text-gray-700">
            <span className="font-medium">{pdfFile.name}</span> · {(pdfFile.size / 1024 / 1024).toFixed(1)} MB
          </p>
        )}
      </div>

      {/* Submitter contact */}
      <div className="border-t border-gray-200 pt-6 space-y-5">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">
          Your contact info
        </p>

        <div>
          <label htmlFor="submitterName" className={labelStyle}>
            Your name <span className="text-red-600">*</span>
          </label>
          <input
            id="submitterName"
            type="text"
            required
            disabled={submitting}
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            autoComplete="name"
            className={fieldStyle}
          />
        </div>

        <div>
          <label htmlFor="submitterEmail" className={labelStyle}>
            Your email <span className="text-red-600">*</span>
          </label>
          <input
            id="submitterEmail"
            type="email"
            required
            disabled={submitting}
            value={submitterEmail}
            onChange={(e) => setSubmitterEmail(e.target.value)}
            autoComplete="email"
            className={fieldStyle}
          />
          <p className={helpStyle}>
            We will send a confirmation here once the submission is reviewed.
          </p>
        </div>

        <div>
          <label htmlFor="submitterPhone" className={labelStyle}>
            Your phone (optional)
          </label>
          <input
            id="submitterPhone"
            type="tel"
            disabled={submitting}
            value={submitterPhone}
            onChange={(e) => setSubmitterPhone(e.target.value)}
            autoComplete="tel"
            className={fieldStyle}
          />
        </div>
      </div>

      {/* Error display */}
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
          disabled={submitting}
          className="w-full sm:w-auto px-8 py-3 text-base font-semibold text-white tracking-wide transition-opacity disabled:opacity-50 disabled:cursor-not-allowed bg-gray-900 hover:bg-gray-800"
        >
          {submitting ? 'Submitting…' : 'Submit for review'}
        </button>
      </div>

      <p className="text-xs text-gray-500 font-light leading-relaxed pt-2">
        By submitting, you confirm you are authorized to publish this material on behalf of the named builder/developer. Submissions are reviewed before publication; we may follow up to clarify details.
      </p>
    </form>
  );
}
