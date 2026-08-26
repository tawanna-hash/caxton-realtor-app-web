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
  footer_template: 'business-card',
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
        <h2 className="mt-1 text-lg font-semibold text-gray-900">Calculator sheet branding</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">
          Added automatically when you print, download, email, or text a completed calculator sheet.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6 p-5">
        <fieldset>
          <legend className="text-sm font-semibold text-gray-900">Photos and logo</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
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
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-gray-900">Professional identity</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Display name" value={form.display_name} onChange={(v) => setField('display_name', v)} required />
            <Field label="Professional title" value={form.professional_title} onChange={(v) => setField('professional_title', v)} placeholder="REALTOR®, Broker Associate" />
            <div>
              <Field
                label="Broker licensed or registered assumed business name"
                value={form.brokerage_name}
                onChange={(v) => setField('brokerage_name', v)}
                required
              />
              <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
                Required on branded materials. Use the full licensed broker name or an assumed business name registered with TREC.
              </p>
            </div>
            <Field label="TREC license number" value={form.license_number} onChange={(v) => setField('license_number', v)} />
            <div className="sm:col-span-2">
              <Field label="Tagline" value={form.tagline} onChange={(v) => setField('tagline', v)} placeholder="Your trusted Central Texas real estate advisor" />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-gray-900">Contact details</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Email" type="email" value={form.email} onChange={(v) => setField('email', v)} />
            <Field label="Mobile phone" type="tel" value={form.phone} onChange={(v) => setField('phone', v)} />
            <div className="sm:col-span-2">
              <Field label="Website" type="url" value={form.website} onChange={(v) => setField('website', v)} placeholder="https://yourwebsite.com" />
            </div>
            <div className="sm:col-span-2">
              <Field label="Office address" value={form.address} onChange={(v) => setField('address', v)} />
            </div>
            <div className="sm:col-span-2">
              <Field label="Address line 2" value={form.address_2} onChange={(v) => setField('address_2', v)} />
            </div>
            <Field label="City" value={form.city} onChange={(v) => setField('city', v)} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="State" value={form.state} onChange={(v) => setField('state', v)} />
              <Field label="ZIP" value={form.zip} onChange={(v) => setField('zip', v)} />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-gray-900">PDF layout</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {FOOTER_TEMPLATE_PICKER_IDS.map((templateId) => FOOTER_TEMPLATE_META[templateId]).map((template) => (
              <label
                key={template.id}
                className={`cursor-pointer rounded-md border p-3 transition ${
                  form.footer_template === template.id
                    ? 'border-[#301D5D] bg-[#301D5D]/5'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="footer-template"
                  value={template.id}
                  checked={form.footer_template === template.id}
                  onChange={() => setField('footer_template', template.id)}
                  className="sr-only"
                />
                <span className="block text-sm font-semibold text-gray-900">{template.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-gray-500">{template.blurb}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <BrandPreview form={form} />

        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
          <p className="font-semibold">Texas advertising compliance</p>
          <p className="mt-1">
            Branded calculator sheets always display the broker name as a dedicated line at no less than 50% of the largest agent contact or logo treatment. Confirm that any assumed business or team name is registered with TREC before use.
          </p>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

        <button
          type="submit"
          disabled={saving || uploading !== null}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: accentColor }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save calculator branding'}
        </button>
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
  const contact = [form.phone, form.email, form.website].filter(Boolean).join('  •  ');
  const name = form.display_name || 'Your name';
  const company = form.brokerage_name || 'Broker licensed or registered assumed business name';

  const headshot = form.photo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={form.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
  ) : null;
  const logo = form.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={form.logo_url} alt="" className="h-8 w-12 shrink-0 object-contain" />
  ) : null;

  let preview: ReactNode;
  switch (form.footer_template) {
    case 'banner':
      preview = (
        <div className="grid min-h-32 overflow-hidden border border-gray-200 bg-white shadow-sm sm:grid-cols-[0.8fr_1.35fr_0.85fr]">
          <div className="flex flex-col items-center justify-center bg-[#173f82] p-4 text-center text-white">
            {headshot}
            <p className="mt-2 truncate text-sm font-bold">{name}</p>
            {form.professional_title && <p className="truncate text-[10px] uppercase tracking-[0.18em] text-white/80">{form.professional_title}</p>}
            <p className="mt-1 max-w-full truncate text-xs font-bold">{company}</p>
          </div>
          <div className="flex items-center p-4">
            <p className="break-words text-sm leading-7 text-gray-800">{contact || 'Your phone, email, and website'}</p>
          </div>
          <div className="flex flex-col items-center justify-center border-t border-gray-200 p-4 text-center sm:border-l sm:border-t-0">
            {logo}
            <p className="mt-2 text-sm font-bold text-gray-900">{company}</p>
          </div>
        </div>
      );
      break;
    case 'minimal':
      preview = (
        <div className="flex min-h-20 items-center gap-3 border-t border-gray-300 bg-white px-4 py-3 shadow-sm">
          {logo}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-gray-900">{name}</p>
            <p className="truncate text-sm font-bold text-gray-800">{company}</p>
            <p className="truncate text-xs text-gray-500">
              {[form.professional_title, contact].filter(Boolean).join('  •  ') || 'Your title and contact details'}
            </p>
          </div>
        </div>
      );
      break;
    case 'signature':
      preview = (
        <div className="grid min-h-32 overflow-hidden border border-gray-200 bg-white shadow-sm sm:grid-cols-[0.82fr_1.3fr_0.88fr]">
          <div className="relative flex items-center justify-center overflow-hidden bg-[#173f82] p-4">
            <span className="absolute -right-10 h-36 w-36 rounded-full border-[8px] border-cyan-500" aria-hidden />
            <div className="relative z-10">{headshot}</div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="hidden h-full w-8 bg-cyan-500 sm:block" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-[#173f82]">{name}</p>
              {form.professional_title && <p className="truncate text-[10px] uppercase tracking-[0.18em] text-gray-700">{form.professional_title}</p>}
              <p className="mt-2 break-words text-xs leading-6 text-gray-700">{contact || 'Your phone, email, and website'}</p>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center border-t border-gray-200 p-4 text-center sm:border-l sm:border-t-0">
            {logo}
            <p className="mt-2 text-sm font-bold text-gray-900">{company}</p>
          </div>
        </div>
      );
      break;
    case 'two-column':
      preview = (
        <div className="overflow-hidden border border-gray-200 bg-white shadow-sm">
          <div className="grid min-h-28 gap-4 p-4 sm:grid-cols-[1fr_1.15fr_0.7fr]">
            <div className="flex min-w-0 items-center gap-3 border-b border-gray-200 pb-3 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
            {logo}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-800">{company}</p>
            </div>
          </div>
            <div className="min-w-0">
              <p className="truncate text-base font-bold uppercase text-[#173f82]">{name}</p>
              {form.professional_title && <p className="truncate text-xs uppercase tracking-[0.18em] text-gray-700">{form.professional_title}</p>}
              <p className="mt-2 break-words text-xs leading-5 text-gray-700">{contact || 'Your phone, email, and website'}</p>
            </div>
            <div className="flex items-center justify-center text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              Connect with me
            </div>
          </div>
          <div className="bg-gray-900 px-4 py-2 text-center font-serif text-sm italic text-white">
            {form.tagline || 'Your trusted real estate professional'}
          </div>
        </div>
      );
      break;
    case 'stacked':
      preview = (
        <div className="flex min-h-36 flex-col items-center justify-center border-t-2 border-[#c4a35a] bg-white p-4 text-center shadow-sm">
          <div className="flex items-end gap-2">
            {headshot}
            {logo}
          </div>
          <p className="mt-2 font-serif text-lg text-gray-900">{name}</p>
          <p className="text-sm font-bold text-gray-800">{company}</p>
          {form.professional_title && <p className="text-xs text-gray-600">{form.professional_title}</p>}
          <p className="mt-1 text-xs text-gray-500">{contact || 'Your contact details'}</p>
        </div>
      );
      break;
    case 'business-card':
    default:
      preview = (
        <div className="grid min-h-28 gap-4 border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-[0.9fr_1fr_1.35fr]">
          <div className="flex min-w-0 flex-col items-center justify-center text-center">
            {logo}
            <p className="mt-2 text-sm font-bold text-gray-900">{company}</p>
          </div>
          <div className="min-w-0 border-t border-gray-200 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
            <p className="truncate text-lg font-semibold text-[#173f82]">{name}</p>
            {form.professional_title && <p className="truncate text-xs uppercase tracking-[0.2em] text-gray-700">{form.professional_title}</p>}
            <p className="mt-2 truncate text-sm font-bold text-gray-800">{company}</p>
          </div>
          <div className="flex items-center border-t border-gray-200 pt-3 text-sm leading-7 text-gray-800 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
            <p className="break-words">{contact || 'Your phone, email, and website'}</p>
          </div>
        </div>
      );
      break;
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Print and PDF preview</p>
        <p className="text-xs font-medium text-[#301D5D]">{FOOTER_TEMPLATE_META[form.footer_template].label}</p>
      </div>
      <div className="mt-3">{preview}</div>
    </div>
  );
}
