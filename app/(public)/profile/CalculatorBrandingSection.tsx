'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { ImageUp, Loader2, Save } from 'lucide-react';
import { getApiBase } from '@/lib/api-base';
import {
  FOOTER_TEMPLATE_META,
  FOOTER_TEMPLATE_PICKER_IDS,
  type FooterBrand,
  type FooterTemplateId,
} from '@/lib/footer-templates';

const API = getApiBase();

type BrandingResponse = {
  branding: {
    template: FooterTemplateId;
    brand: FooterBrand;
  } | null;
};

type FormState = {
  display_name: string;
  professional_title: string;
  brokerage_name: string;
  email: string;
  phone: string;
  office_phone: string;
  website: string;
  logo_url: string;
  photo_url: string;
  address: string;
  address_2: string;
  city: string;
  state: string;
  zip: string;
  license_number: string;
  tagline: string;
  footer_template: FooterTemplateId;
};

const EMPTY_FORM: FormState = {
  display_name: '',
  professional_title: '',
  brokerage_name: '',
  email: '',
  phone: '',
  office_phone: '',
  website: '',
  logo_url: '',
  photo_url: '',
  address: '',
  address_2: '',
  city: '',
  state: '',
  zip: '',
  license_number: '',
  tagline: '',
  footer_template: 'split-column',
};

function formFromResponse(data: BrandingResponse): FormState {
  const branding = data.branding;
  if (!branding) return EMPTY_FORM;
  const brand = branding.brand;
  return {
    display_name: brand.name ?? '',
    professional_title: brand.title ?? '',
    brokerage_name: brand.company ?? '',
    email: brand.email ?? '',
    phone: brand.phone ?? '',
    office_phone: brand.office_phone ?? '',
    website: brand.website ?? '',
    logo_url: brand.logo_url ?? '',
    photo_url: brand.photo_url ?? '',
    address: brand.address ?? '',
    address_2: brand.address_2 ?? '',
    city: brand.city ?? '',
    state: brand.state ?? '',
    zip: brand.zip ?? '',
    license_number: brand.license_number ?? '',
    tagline: brand.tagline ?? '',
    footer_template: branding.template,
  };
}

const inputClass =
  'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#301D5D] focus:ring-2 focus:ring-[#301D5D]/15';

export default function CalculatorBrandingSection({ accentColor }: { accentColor: string }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'headshot' | 'logo' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/calculator-branding`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load calculator branding.');
        return response.json() as Promise<BrandingResponse>;
      })
      .then((data) => {
        if (!cancelled) setForm(formFromResponse(data));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load calculator branding.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  async function uploadImage(kind: 'headshot' | 'logo', file: File) {
    setUploading(kind);
    setError(null);
    setMessage(null);
    try {
      const payload = new FormData();
      payload.set('file', file);
      payload.set('kind', kind);
      const response = await fetch(`${API}/calculator-branding/upload-image`, {
        method: 'POST',
        credentials: 'include',
        body: payload,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Image upload failed.');
      setField(kind === 'logo' ? 'logo_url' : 'photo_url', data.url);
      setMessage(`${kind === 'logo' ? 'Logo' : 'Headshot'} uploaded. Save changes to apply it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploading(null);
    }
  }

  function onFileChange(kind: 'headshot' | 'logo') {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void uploadImage(kind, file);
    };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.brokerage_name.trim()) {
      setError('Enter the broker’s licensed name or TREC-registered assumed business name.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`${API}/calculator-branding`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Could not save calculator branding.');
      setForm(formFromResponse(data));
      setMessage('Calculator branding saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save calculator branding.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading calculator branding…
        </div>
      </section>
    );
  }

  return (
    <section
      id="calculator-branding"
      className="scroll-mt-24 overflow-hidden rounded-lg border border-gray-200 bg-white"
    >
      <div className="border-b border-gray-200 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: accentColor }}>
          REALTOR® branding
        </p>
        <h2 className="mt-1 text-lg font-semibold text-gray-900">Calculator branding designer</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">
          Personalize one of the four approved designs. Your saved design is added automatically when you print, download, email, or text a calculator sheet.
        </p>
      </div>

      <form onSubmit={onSubmit} className="bg-[#eef2f6]">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#078fca] px-4 py-3 text-white">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em]">Choose a design</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {FOOTER_TEMPLATE_PICKER_IDS.map((templateId) => {
                const template = FOOTER_TEMPLATE_META[templateId];
                const selected = form.footer_template === template.id;
                return (
                  <label
                    key={template.id}
                    className={`cursor-pointer rounded px-3 py-1.5 text-xs font-bold transition ${
                      selected ? 'bg-white text-[#153f83] shadow-sm' : 'bg-[#087fb3] text-white hover:bg-[#0876a6]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="footer-template"
                      value={template.id}
                      checked={selected}
                      onChange={() => setField('footer_template', template.id)}
                      className="sr-only"
                    />
                    {template.label}
                  </label>
                );
              })}
            </div>
          </div>
          <button
            type="submit"
            disabled={saving || uploading !== null}
            className="flex min-h-10 items-center justify-center gap-2 rounded bg-[#79bd35] px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#68aa2b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {saving ? 'Saving…' : 'Save design'}
          </button>
        </div>

        <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-5 border-r border-gray-200 bg-white p-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Images</p>
              <div className="mt-2 grid gap-2">
                <ImageUpload
                  label="Professional headshot"
                  value={form.photo_url}
                  uploading={uploading === 'headshot'}
                  onChange={onFileChange('headshot')}
                  round
                />
                <ImageUpload
                  label="Brokerage logo"
                  value={form.logo_url}
                  uploading={uploading === 'logo'}
                  onChange={onFileChange('logo')}
                />
              </div>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Quick fill</legend>
              <Field label="Name" value={form.display_name} onChange={(v) => setField('display_name', v)} required />
              <Field label="Title" value={form.professional_title} onChange={(v) => setField('professional_title', v)} placeholder="REALTOR®" />
              <Field label="Cell phone" type="tel" value={form.phone} onChange={(v) => setField('phone', v)} />
              <Field label="Office phone" type="tel" value={form.office_phone} onChange={(v) => setField('office_phone', v)} />
              <Field label="Email" type="email" value={form.email} onChange={(v) => setField('email', v)} />
              <Field label="Website" type="url" value={form.website} onChange={(v) => setField('website', v)} placeholder="https://yourwebsite.com" />
              <Field
                label="Broker licensed or registered name"
                value={form.brokerage_name}
                onChange={(v) => setField('brokerage_name', v)}
                required
              />
              <Field label="Tagline" value={form.tagline} onChange={(v) => setField('tagline', v)} />
            </fieldset>

            <details className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.12em] text-gray-600">Additional details</summary>
              <div className="mt-3 space-y-3">
                <Field label="TREC license number" value={form.license_number} onChange={(v) => setField('license_number', v)} />
                <Field label="Office address" value={form.address} onChange={(v) => setField('address', v)} />
                <Field label="Address line 2" value={form.address_2} onChange={(v) => setField('address_2', v)} />
                <Field label="City" value={form.city} onChange={(v) => setField('city', v)} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="State" value={form.state} onChange={(v) => setField('state', v)} />
                  <Field label="ZIP" value={form.zip} onChange={(v) => setField('zip', v)} />
                </div>
              </div>
            </details>

            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-950">
              <p className="font-semibold">Texas advertising compliance</p>
              <p className="mt-1">
                The broker name remains clearly displayed at no less than 50% of the largest agent contact or logo treatment.
              </p>
            </div>
          </aside>

          <div className="flex min-h-[620px] flex-col p-4 sm:p-6 lg:p-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Live PDF canvas</p>
                <p className="mt-1 text-sm text-gray-600">Changes appear here instantly.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#153f83] shadow-sm">
                {FOOTER_TEMPLATE_META[form.footer_template].label}
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center rounded-lg border border-gray-200 bg-[#f7f8fa] p-3 shadow-inner sm:p-8">
              <div className="w-full max-w-4xl">
                <BrandPreview form={form} />
              </div>
            </div>

            {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {message && <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
          </div>
        </div>
      </form>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className={inputClass}
      />
    </label>
  );
}

function ImageUpload({
  label,
  value,
  uploading,
  onChange,
  round = false,
}: {
  label: string;
  value: string;
  uploading: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  round?: boolean;
}) {
  return (
    <label className="flex min-h-32 cursor-pointer items-center gap-4 rounded-md border border-dashed border-gray-300 p-4 transition hover:border-[#301D5D]">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt=""
          className={`h-16 w-16 shrink-0 border border-gray-200 bg-white object-contain ${round ? 'rounded-full object-cover' : 'rounded-md'}`}
        />
      ) : (
        <span className={`flex h-16 w-16 shrink-0 items-center justify-center bg-gray-100 text-gray-500 ${round ? 'rounded-full' : 'rounded-md'}`}>
          <ImageUp className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <span>
        <span className="block text-sm font-semibold text-gray-900">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-gray-500">
          {uploading ? 'Uploading…' : 'JPG, PNG, or WebP up to 5 MB'}
        </span>
      </span>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onChange} disabled={uploading} className="sr-only" />
    </label>
  );
}

function BrandPreview({ form }: { form: FormState }) {
  const name = form.display_name || 'Your name';
  const company = form.brokerage_name || 'Broker licensed or registered assumed business name';
  const title = form.professional_title || 'REALTOR®';
  const mobile = form.phone || 'Mobile phone';
  const office = form.office_phone || 'Office phone';
  const email = form.email || 'Email address';
  const website = form.website || 'Website';

  const headshot = (
    <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-gray-200">
      {form.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={form.photo_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center text-[10px] font-semibold uppercase text-gray-500">Headshot</span>
      )}
    </div>
  );
  const logo = form.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={form.logo_url} alt="" className="h-12 w-20 object-contain" />
  ) : (
    <span className="grid grid-cols-3 gap-1" aria-label="Brokerage logo">
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className="h-2.5 w-2.5 rounded-[2px] bg-[#08ace0]" />
      ))}
    </span>
  );
  const companyBlock = (
    <div className="flex flex-col items-center text-center">
      {logo}
      <p className="mt-2 max-w-44 text-base font-black uppercase leading-none text-black">{company}</p>
    </div>
  );
  const contactLines = (
    <div className="space-y-1 text-xs font-semibold leading-tight text-black">
      <p><span className="font-black text-[#079bce]">C:</span> {mobile}</p>
      <p><span className="font-black text-[#079bce]">O:</span> {office}</p>
      <p><span className="font-black text-[#079bce]">@</span> {email}</p>
      <p><span className="font-black text-[#079bce]">W:</span> {website}</p>
    </div>
  );

  let preview: ReactNode;
  switch (form.footer_template) {
    case 'minimal-rows':
      preview = (
        <div className="grid min-h-44 overflow-hidden border border-gray-300 bg-white shadow-sm sm:grid-cols-[0.8fr_1.6fr_0.9fr]">
          <div className="flex items-center justify-center border-b border-gray-200 p-4 sm:border-b-0 sm:border-r">
            {headshot}
          </div>
          <div className="flex min-w-0 flex-col justify-center px-5 py-4">
            <div>
              <p className="truncate text-lg font-bold text-slate-900">{name}</p>
              <p className="truncate text-xs font-semibold text-[#301D5D]">{title}</p>
            </div>
            <div className="mt-3 border-t border-gray-200 pt-3">
              <p className="truncate text-sm font-bold text-slate-900">{company}</p>
              {contactLines}
            </div>
          </div>
          <div className="flex items-center justify-center border-t border-gray-200 p-4 sm:border-l sm:border-t-0">
            {companyBlock}
          </div>
        </div>
      );
      break;
    case 'split-column':
    default:
      preview = (
        <div className="grid min-h-44 overflow-hidden border border-gray-300 bg-white shadow-sm sm:grid-cols-[0.8fr_1.7fr_0.9fr]">
          <div className="flex items-center justify-center border-b border-gray-200 p-4 sm:border-b-0 sm:border-r">
            {headshot}
          </div>
          <div className="flex min-w-0 items-center px-5 py-4">
            <div className="w-full border-l-[3px] border-[#301D5D] pl-4">
              <p className="truncate text-lg font-bold text-slate-900">{name}</p>
              <p className="truncate text-xs font-semibold text-[#301D5D]">{title}</p>
              <p className="mt-1 truncate text-sm font-bold text-slate-900">{company}</p>
              <div className="mt-2">
                {contactLines}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center border-t border-gray-200 p-4 sm:border-l sm:border-t-0">
            {companyBlock}
          </div>
        </div>
      );
      break;
  }

  return <div className="w-full">{preview}</div>;
}
