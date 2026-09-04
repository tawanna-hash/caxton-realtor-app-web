'use client';

import { upload } from '@vercel/blob/client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';

type Kind = 'listing' | 'promotion';
type Publication = 'realtyline' | 'newsline' | 'realtyline-houston' | 'realtyline-dallas' | 'both';
const PUBLICATION_OPTIONS: { value: Publication; label: string }[] = [
  { value: 'realtyline', label: 'RealtyLine Austin' },
  { value: 'newsline', label: 'Newsline San Antonio' },
  { value: 'realtyline-houston', label: 'RealtyLine Houston' },
  { value: 'realtyline-dallas', label: 'RealtyLine Dallas/Ft. Worth' },
  { value: 'both', label: 'Austin + San Antonio' },
];

const fieldStyle =
  'w-full border border-gray-300 px-4 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-brand-700 transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed rounded-md';
const labelStyle = 'block text-sm font-medium text-gray-900 mb-1.5';
const helpStyle = 'mt-1 text-xs text-gray-500 font-light';

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_IMG_BYTES = 10 * 1024 * 1024; // 10 MB

export default function AdminInventoryCreateForm() {
  const router = useRouter();

  // Core fields
  const [kind, setKind] = useState<Kind>('promotion');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [builderName, setBuilderName] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [city, setCity] = useState<string>('Greater Austin');
  const [state, setState] = useState<string>('TX');
  const [publication, setPublication] = useState<Publication>('realtyline');
  const [description, setDescription] = useState<string>('');
  const [sourceUrl, setSourceUrl] = useState<string>('');

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
  const [startsAt, setStartsAt] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');

  // Media
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Flyer auto-fill state
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);

  // Publication-aware city defaults
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- city default mirrors selected publication; refactor tracked separately
    if (publication === 'realtyline') setCity('Greater Austin');
    else if (publication === 'newsline') setCity('Greater San Antonio');
    else if (publication === 'realtyline-houston') setCity('Greater Houston');
    else if (publication === 'realtyline-dallas') setCity('Dallas/Ft. Worth');
    // 'both' leaves city untouched — admin chooses
  }, [publication]);

  // Preselect the kind from ?kind= (deep-linked from the split list pages'
  // "+ Create" buttons). Client-only — window isn't available during SSR.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const k = new URLSearchParams(window.location.search).get('kind');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time URL param read on mount
    if (k === 'listing' || k === 'promotion') setKind(k);
  }, []);

  function onImageChange(e: ChangeEvent<HTMLInputElement>) {
    setImageError(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setImageFile(null);
      return;
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(f.type)) {
      setImageError('Image must be jpg, png, or webp.');
      setImageFile(null);
      return;
    }
    if (f.size > MAX_IMG_BYTES) {
      setImageError('Image must be under 10 MB.');
      setImageFile(null);
      return;
    }
    setImageFile(f);
  }

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

  // Auto-populate form fields from the attached flyer PDF. Best-effort —
  // the admin reviews/tweaks before publishing. Only fills empty fields so
  // it never clobbers a manual edit.
  async function handleAutoFill() {
    if (!pdfFile) {
      setPdfError('Attach a flyer PDF first, then auto-fill.');
      return;
    }
    setExtracting(true);
    setExtractNote(null);
    setPdfError(null);
    try {
      const fd = new FormData();
      fd.append('flyerPdf', pdfFile);
      const res = await fetch('/api/admin/inventory/extract-flyer', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; title?: string | null; description?: string | null;
            builderName?: string | null; expiresAt?: string | null;
            priceMin?: number | null; priceMax?: number | null;
            bedsMin?: number | null; bedsMax?: number | null;
            sqftMin?: number | null; sqftMax?: number | null; }
        | null;
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      if (!body) throw new Error('No response from server');
      if (body.title && !title.trim()) setTitle(body.title);
      if (body.description && !description.trim()) setDescription(body.description);
      if (body.builderName && !builderName.trim()) setBuilderName(body.builderName);
      if (body.expiresAt && !expiresAt) setExpiresAt(body.expiresAt);
      if (kind === 'listing') {
        if (body.priceMin && !priceMin) setPriceMin(String(body.priceMin));
        if (body.priceMax && !priceMax) setPriceMax(String(body.priceMax));
        if (body.bedsMin && !bedsMin) setBedsMin(String(body.bedsMin));
        if (body.bedsMax && !bedsMax) setBedsMax(String(body.bedsMax));
        if (body.sqftMin && !sqftMin) setSqftMin(String(body.sqftMin));
        if (body.sqftMax && !sqftMax) setSqftMax(String(body.sqftMax));
      }
      setExtractNote('Flyer fields auto-filled — review before publishing.');
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Auto-fill failed');
    } finally {
      setExtracting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (!builderName.trim()) {
        throw new Error('Builder/developer name is required.');
      }
      if (!title.trim()) {
        throw new Error('Title is required.');
      }
      if (!city.trim()) {
        throw new Error('City is required.');
      }
      if (!imageFile && !pdfFile) {
        throw new Error('Please attach an image (preferred) or a PDF.');
      }
      // Promotions MUST have an expiration date now that the auto-expire cron
      // hides them after expires_at passes. Without one, the promo would run
      // forever — defeats the whole point of the auto-expire system.
      if (kind === 'promotion' && !expiresAt) {
        throw new Error('Expiration date is required for promotions.');
      }

      // Direct-to-Blob upload for image + PDF (bypasses the 4.5MB
      // Vercel serverless body cap).  The files never touch our
      // /api/inventory/submit function — they go straight to Blob
      // edge, and we send only the resulting URLs to the server.
      const draftId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);

      let uploadedImageUrl: string | null = null;
      let uploadedFlyerPdfUrl: string | null = null;

      if (imageFile) {
        setPdfError(null);
        const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
        const b = await upload(
          `inventory-thumbs/new/${draftId}/${safeName}`,
          imageFile,
          {
            access: 'public',
            handleUploadUrl: '/api/admin/inventory/upload-token',
            contentType: imageFile.type,
          },
        );
        uploadedImageUrl = b.url;
      }
      if (pdfFile) {
        setPdfError(null);
        const safeName = pdfFile.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
        const b = await upload(
          `inventory-flyers/new/${draftId}/${safeName}`,
          pdfFile,
          {
            access: 'public',
            handleUploadUrl: '/api/admin/inventory/upload-token',
            contentType: 'application/pdf',
          },
        );
        uploadedFlyerPdfUrl = b.url;
      }

      // JSON body — every field goes as a string/number, no multipart.
      const jsonBody: Record<string, unknown> = {
        mode: 'admin',
        kind,
        publication,
        submittedByName: 'Admin',
        submittedByEmail: 'tawanna@realtynewsnow.app',
        builderName: builderName.trim(),
        title: title.trim(),
        city: city.trim(),
        state: (state.trim() || 'TX'),
        description: description.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        imageUrl: uploadedImageUrl,
        flyerPdfUrl: uploadedFlyerPdfUrl,
      };
      if (kind === 'listing') {
        if (bedsMin) jsonBody.bedsMin = bedsMin;
        if (bedsMax) jsonBody.bedsMax = bedsMax;
        if (bathsMin) jsonBody.bathsMin = bathsMin;
        if (bathsMax) jsonBody.bathsMax = bathsMax;
        if (sqftMin) jsonBody.sqftMin = sqftMin;
        if (sqftMax) jsonBody.sqftMax = sqftMax;
        if (priceMin) jsonBody.priceMin = priceMin;
        if (priceMax) jsonBody.priceMax = priceMax;
      } else {
        if (startsAt) jsonBody.startsAt = startsAt;
        if (expiresAt) jsonBody.expiresAt = expiresAt;
      }

      const res = await fetch('/api/inventory/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonBody),
        credentials: 'include',
      });

      const body = (await res.json().catch(() => null)) as
        | { ok: boolean; error?: string; id?: number }
        | null;

      if (!res.ok || !body?.ok) {
        setErrorMessage(
          body?.error ||
            'Submission failed. Check that you are still logged in to admin.',
        );
        return;
      }

      // Success → go to the active list, new row will be at top
      router.push(kind === 'promotion' ? '/admin/inventory/promotions?status=active' : '/admin/inventory?status=active');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Could not reach the server. Check your connection.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {errorMessage && (
        <div className="border border-red-300 bg-red-50 px-4 py-3 rounded-md">
          <p className="text-sm text-red-900">{errorMessage}</p>
        </div>
      )}

      {/* Kind toggle */}
      <div>
        <label className={labelStyle}>Type</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKind('promotion')}
            className={
              'px-4 py-2 text-sm font-medium border rounded-md transition-colors ' +
              (kind === 'promotion'
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500')
            }
            aria-pressed={kind === 'promotion'}
          >
            Promotion
          </button>
          <button
            type="button"
            onClick={() => setKind('listing')}
            className={
              'px-4 py-2 text-sm font-medium border rounded-md transition-colors ' +
              (kind === 'listing'
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500')
            }
            aria-pressed={kind === 'listing'}
          >
            Listing
          </button>
        </div>
      </div>

      {/* Title */}
      <div>
        <label htmlFor="title" className={labelStyle}>
          {kind === 'promotion' ? 'Promotion title' : 'Community / listing title'}
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          disabled={submitting}
          className={fieldStyle}
          placeholder={kind === 'promotion' ? '2/1 Buydown — Spring Bouquet' : 'Sweetwater — Move-in Ready'}
        />
      </div>

      {/* Builder name (free text) */}
      <div>
        <label htmlFor="builderName" className={labelStyle}>
          Builder / developer name
        </label>
        <input
          id="builderName"
          type="text"
          value={builderName}
          onChange={(e) => setBuilderName(e.target.value)}
          required
          disabled={submitting}
          className={fieldStyle}
          placeholder="e.g. M/I Homes, Lennar, KB Home"
        />
      </div>

      {/* Publication + city + state */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="publication" className={labelStyle}>Publication</label>
          <select
            id="publication"
            value={publication}
            onChange={(e) => setPublication(e.target.value as Publication)}
            disabled={submitting}
            className={fieldStyle}
          >
            {PUBLICATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="city" className={labelStyle}>City / market</label>
          <input
            id="city"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
            disabled={submitting}
            className={fieldStyle}
          />
        </div>
        <div>
          <label htmlFor="state" className={labelStyle}>State</label>
          <input
            id="state"
            type="text"
            value={state}
            onChange={(e) => setState(e.target.value)}
            disabled={submitting}
            className={fieldStyle}
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className={labelStyle}>
          Description (optional)
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
          rows={4}
          className={fieldStyle}
          placeholder="Short description for the card and detail page"
        />
      </div>

      {/* Image upload */}
      <div>
        <label htmlFor="image" className={labelStyle}>
          Image {!pdfFile && <span className="text-red-600">*</span>}
        </label>
        <input
          id="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onImageChange}
          disabled={submitting}
          className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-900 hover:file:bg-gray-50 file:rounded-md disabled:opacity-50"
        />
        {imageFile && (
          <p className={helpStyle}>{imageFile.name} ({(imageFile.size / 1024 / 1024).toFixed(2)} MB)</p>
        )}
        {imageError && <p className="mt-1 text-xs text-red-600">{imageError}</p>}
        <p className={helpStyle}>jpg, png, or webp. Max 10 MB. Used as the card thumbnail.</p>
      </div>

      {/* PDF upload */}
      <div>
        <label htmlFor="pdf" className={labelStyle}>
          Flyer PDF (optional)
        </label>
        <input
          id="pdf"
          type="file"
          accept="application/pdf"
          onChange={onPdfChange}
          disabled={submitting}
          className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-900 hover:file:bg-gray-50 file:rounded-md disabled:opacity-50"
        />
        {pdfFile && (
          <p className={helpStyle}>{pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)</p>
        )}
        {pdfError && <p className="mt-1 text-xs text-red-600">{pdfError}</p>}
        <p className={helpStyle}>Max 25 MB. Optional when an image is provided.</p>
        {pdfFile && (
          <button
            type="button"
            onClick={handleAutoFill}
            disabled={extracting || submitting}
            className="mt-2 inline-flex items-center gap-1.5 bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700 rounded-md transition-colors disabled:opacity-60"
          >
            {extracting ? 'Extracting…' : 'Auto-fill from flyer'}
          </button>
        )}
        {extractNote && (
          <p className="mt-1 text-xs text-green-700">{extractNote}</p>
        )}
      </div>

      {/* Source URL */}
      <div>
        <label htmlFor="sourceUrl" className={labelStyle}>
          Source URL (optional)
        </label>
        <input
          id="sourceUrl"
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          disabled={submitting}
          className={fieldStyle}
          placeholder="https://www.builder.com/promotion-detail-page"
        />
        <p className={helpStyle}>Where the card click takes the realtor. Falls back to the PDF if not provided.</p>
      </div>

      {/* Promotion-specific fields */}
      {kind === 'promotion' && (
        <div className="space-y-6 border-t border-gray-200 pt-6">
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="startsAt" className={labelStyle}>Starts (optional)</label>
              <input
                id="startsAt"
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                disabled={submitting}
                className={fieldStyle}
              />
            </div>
            <div>
              <label htmlFor="expiresAt" className={labelStyle}>
                Expires <span className="text-red-600">*</span>
              </label>
              <input
                id="expiresAt"
                type="date"
                required
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={submitting}
                className={fieldStyle}
              />
              <p className="text-xs text-gray-500 mt-1">Promotion auto-hides after this date (end of day Central).</p>
            </div>
          </div>
        </div>
      )}

      {/* Listing-specific fields */}
      {kind === 'listing' && (
        <div className="space-y-4 border-t border-gray-200 pt-6">
          <p className="text-sm font-medium text-gray-900">Listing details (all optional)</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="bedsMin" className={labelStyle}>Beds min</label>
              <input id="bedsMin" type="number" min="0" value={bedsMin} onChange={(e) => setBedsMin(e.target.value)} disabled={submitting} className={fieldStyle} />
            </div>
            <div>
              <label htmlFor="bedsMax" className={labelStyle}>Beds max</label>
              <input id="bedsMax" type="number" min="0" value={bedsMax} onChange={(e) => setBedsMax(e.target.value)} disabled={submitting} className={fieldStyle} />
            </div>
            <div>
              <label htmlFor="bathsMin" className={labelStyle}>Baths min</label>
              <input id="bathsMin" type="number" min="0" step="0.5" value={bathsMin} onChange={(e) => setBathsMin(e.target.value)} disabled={submitting} className={fieldStyle} />
            </div>
            <div>
              <label htmlFor="bathsMax" className={labelStyle}>Baths max</label>
              <input id="bathsMax" type="number" min="0" step="0.5" value={bathsMax} onChange={(e) => setBathsMax(e.target.value)} disabled={submitting} className={fieldStyle} />
            </div>
            <div>
              <label htmlFor="sqftMin" className={labelStyle}>Sqft min</label>
              <input id="sqftMin" type="number" min="0" value={sqftMin} onChange={(e) => setSqftMin(e.target.value)} disabled={submitting} className={fieldStyle} />
            </div>
            <div>
              <label htmlFor="sqftMax" className={labelStyle}>Sqft max</label>
              <input id="sqftMax" type="number" min="0" value={sqftMax} onChange={(e) => setSqftMax(e.target.value)} disabled={submitting} className={fieldStyle} />
            </div>
            <div>
              <label htmlFor="priceMin" className={labelStyle}>Price min ($)</label>
              <input id="priceMin" type="number" min="0" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} disabled={submitting} className={fieldStyle} />
            </div>
            <div>
              <label htmlFor="priceMax" className={labelStyle}>Price max ($)</label>
              <input id="priceMax" type="number" min="0" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} disabled={submitting} className={fieldStyle} />
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="border-t border-gray-200 pt-6 flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="bg-brand-700 text-white px-4 py-2 text-sm font-medium hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
        >
          {submitting ? 'Publishing…' : kind === 'promotion' ? 'Publish Promotion' : 'Publish Listing'}
        </button>
        <button
          type="button"
          onClick={() => router.push(kind === 'promotion' ? '/admin/inventory/promotions' : '/admin/inventory')}
          disabled={submitting}
          className="border border-gray-300 text-gray-700 px-4 py-2 text-sm font-medium hover:border-gray-500 disabled:opacity-50 rounded-md transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
