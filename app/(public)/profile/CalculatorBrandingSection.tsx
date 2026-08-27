'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Check, Copy, Download, ImageUp, Loader2, Save } from 'lucide-react';
import { getApiBase } from '@/lib/api-base';
import CustomDesignerCanvas from '../custom-designer/CustomDesignerCanvas';
import {
  createCustomDesignPreset,
  normalizeCustomDesign,
  type CustomDesignConfig,
} from '@/lib/custom-design';
import {
  type FooterBrand,
  type FooterTemplateId,
} from '@/lib/footer-templates';

const API = getApiBase();

type BrandingResponse = {
  branding: {
    template: FooterTemplateId;
    brand: FooterBrand;
    customDesign?: CustomDesignConfig;
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
  facebook_url: string;
  instagram_url: string;
  x_url: string;
  linkedin_url: string;
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
  custom_design: CustomDesignConfig;
};

const EMPTY_FORM: FormState = {
  display_name: '',
  professional_title: '',
  brokerage_name: '',
  email: '',
  phone: '',
  office_phone: '',
  website: '',
  facebook_url: '',
  instagram_url: '',
  x_url: '',
  linkedin_url: '',
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
  custom_design: createCustomDesignPreset('business-card'),
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
    facebook_url: brand.facebook_url ?? '',
    instagram_url: brand.instagram_url ?? '',
    x_url: brand.x_url ?? '',
    linkedin_url: brand.linkedin_url ?? '',
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
    custom_design: normalizeCustomDesign(branding.customDesign, branding.template),
  };
}

const inputClass =
  'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#301D5D] focus:ring-2 focus:ring-[#301D5D]/15';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character] ?? character);
}

function emailSignatureHtml(form: FormState): string {
  const design = normalizeCustomDesign(form.custom_design, form.footer_template);
  const primary = escapeHtml(design.textColor);
  const accent = escapeHtml(design.accentColor);
  const background = escapeHtml(design.backgroundColor);
  const name = escapeHtml(form.display_name || 'Your name');
  const title = escapeHtml(form.professional_title || 'REALTOR®');
  const company = escapeHtml(form.brokerage_name);
  const logo = form.logo_url
    ? `<img src="${escapeHtml(form.logo_url)}" alt="${company}" width="96" style="display:block;max-width:96px;max-height:58px;object-fit:contain;border:0">`
    : '';
  const photo = form.photo_url
    ? `<img src="${escapeHtml(form.photo_url)}" alt="${name}" width="92" height="92" style="display:block;width:92px;height:92px;border-radius:50%;object-fit:cover;border:4px solid #ffffff">`
    : '';
  const lines = [
    form.phone && `<b style="color:${accent}">C:</b> ${escapeHtml(form.phone)}`,
    form.office_phone && `<b style="color:${accent}">O:</b> ${escapeHtml(form.office_phone)}`,
    form.email && `<a href="mailto:${escapeHtml(form.email)}" style="color:${primary};text-decoration:none">${escapeHtml(form.email)}</a>`,
    form.website && `<a href="${escapeHtml(form.website)}" style="color:${primary};text-decoration:none">${escapeHtml(form.website)}</a>`,
  ].filter(Boolean).join('<br>');
  const socials = [
    ['f', form.facebook_url],
    ['ig', form.instagram_url],
    ['x', form.x_url],
    ['in', form.linkedin_url],
  ].filter((entry): entry is [string, string] => Boolean(entry[1])).map(([label, url]) =>
    `<a href="${escapeHtml(url)}" style="display:inline-block;margin-right:7px;color:${primary};text-decoration:none;font-weight:700">${label}</a>`,
  ).join('');
  const companyCell = `<td style="padding:18px 22px;text-align:center;vertical-align:middle">${logo}<div style="margin-top:8px;font:700 15px Arial,sans-serif;text-transform:uppercase;color:${primary}">${company}</div></td>`;
  const identityCell = `<td style="padding:18px 22px;vertical-align:middle"><div style="font:700 17px Arial,sans-serif;color:${primary}">${name}</div><div style="margin-top:3px;font:11px Arial,sans-serif;letter-spacing:3px;color:${primary}">${title.toUpperCase()}</div><div style="margin-top:13px;font:12px/1.7 Arial,sans-serif;color:${primary}">${lines}</div>${socials ? `<div style="margin-top:9px">${socials}</div>` : ''}</td>`;
  const tagline = escapeHtml(form.tagline || 'As your trusted real estate agent, I provide results that move you');
  const customText = design.elements
    .filter((element) => element.kind === 'text' && element.text?.trim())
    .map((element) => escapeHtml(element.text!.trim()))
    .join(' &nbsp;•&nbsp; ');
  const customRow = customText
    ? `<tr><td colspan="3" style="padding:8px 18px;background:${accent};color:${background};font:600 12px Arial,sans-serif;text-align:center">${customText}</td></tr>`
    : '';

  if (form.footer_template === 'banner' || form.footer_template === 'signature') {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;border:1px solid #d1d5db;background:${background}"><tr><td style="width:150px;padding:18px;text-align:center;vertical-align:middle;background:${primary}">${photo}<div style="margin-top:9px;font:700 15px Arial,sans-serif;color:${background}">${name}</div><div style="font:10px Arial,sans-serif;letter-spacing:2px;color:${background}">${title.toUpperCase()}</div></td>${identityCell}${companyCell}</tr>${customRow}</table>`;
  }

  if (form.footer_template === 'two-column') {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;border:1px solid #d1d5db;background:${background}"><tr>${companyCell}${identityCell}<td style="padding:18px;vertical-align:middle;text-align:center">${socials}</td></tr><tr><td colspan="3" style="padding:10px 18px;background:${accent};color:${background};text-align:center;font:italic 15px Georgia,serif">${customText || tagline}</td></tr></table>`;
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;border:1px solid #d1d5db;background:${background}"><tr>${companyCell}${identityCell}<td style="padding:18px 22px;vertical-align:middle;font:12px/1.8 Arial,sans-serif;color:${primary}">${lines}${socials ? `<div style="margin-top:10px">${socials}</div>` : ''}</td></tr>${customRow}</table>`;
}

export default function CalculatorBrandingSection({ accentColor }: { accentColor: string }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'headshot' | 'logo' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [designSurface, setDesignSurface] = useState<'email' | 'calculator'>('email');
  const [copied, setCopied] = useState(false);

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

  function setLayout(layout: FooterTemplateId) {
    setForm((current) => ({
      ...current,
      footer_template: layout,
      custom_design: createCustomDesignPreset(layout),
    }));
    setMessage(null);
  }

  async function copyEmailSignature() {
    const html = emailSignatureHtml(form);
    const plainText = [
      form.display_name,
      form.professional_title,
      form.brokerage_name,
      form.phone,
      form.office_phone,
      form.email,
      form.website,
    ].filter(Boolean).join('\n');
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(html);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the signature. Download the HTML file instead.');
    }
  }

  function downloadEmailSignature() {
    const documentHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Email signature</title></head><body>${emailSignatureHtml(form)}</body></html>`;
    const url = URL.createObjectURL(new Blob([documentHtml], { type: 'text/html' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'realty-news-now-email-signature.html';
    anchor.click();
    URL.revokeObjectURL(url);
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
      setMessage('Custom branding saved.');
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
        <h2 className="mt-1 text-lg font-semibold text-gray-900">Custom branding designer</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">
          Design email signatures and calculator sheets from one saved professional profile.
        </p>
      </div>

      <form onSubmit={onSubmit} className="bg-[#eef2f6]">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#078fca] px-4 py-3 text-white">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">Output</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setDesignSurface('email')} className={`rounded px-3 py-1.5 text-xs font-bold transition ${designSurface === 'email' ? 'bg-[#153f83] text-white' : 'bg-white/15 text-white hover:bg-white/25'}`} data-testid="button-output-email">Email signature</button>
              <button type="button" onClick={() => setDesignSurface('calculator')} className={`rounded px-3 py-1.5 text-xs font-bold transition ${designSurface === 'calculator' ? 'bg-[#153f83] text-white' : 'bg-white/15 text-white hover:bg-white/25'}`} data-testid="button-output-calculator">Calculator PDF</button>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {designSurface === 'email' && (
              <>
                <button
                  type="button"
                  onClick={() => void copyEmailSignature()}
                  className="flex min-h-10 items-center gap-2 rounded bg-white px-4 py-2 text-sm font-bold text-[#153f83] shadow-sm"
                >
                  {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy signature'}
                </button>
                <button
                  type="button"
                  onClick={downloadEmailSignature}
                  className="flex min-h-10 items-center gap-2 rounded bg-[#087fb3] px-4 py-2 text-sm font-bold text-white shadow-sm"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download HTML
                </button>
              </>
            )}
            <button
              type="submit"
              disabled={saving || uploading !== null}
              className="flex min-h-10 items-center justify-center gap-2 rounded bg-[#79bd35] px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#68aa2b] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save design'}
            </button>
          </div>
        </div>

        <div className="space-y-4 p-3 sm:p-5">
          <details className="rounded-lg border border-gray-200 bg-white" open>
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-800">
              Professional profile & assets
              <span className="ml-2 text-xs font-normal text-gray-500">Content used by the protected and linked canvas layers</span>
            </summary>
            <div className="grid gap-5 border-t border-gray-200 p-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <ImageUpload label="Professional headshot" value={form.photo_url} uploading={uploading === 'headshot'} onChange={onFileChange('headshot')} round />
                <ImageUpload label="Brokerage logo" value={form.logo_url} uploading={uploading === 'logo'} onChange={onFileChange('logo')} />
              </div>
              <fieldset>
                <legend className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">Identity & contact</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Field label="Name" value={form.display_name} onChange={(v) => setField('display_name', v)} required />
                  <Field label="Title" value={form.professional_title} onChange={(v) => setField('professional_title', v)} placeholder="REALTOR®" />
                  <Field label="Cell phone" type="tel" value={form.phone} onChange={(v) => setField('phone', v)} />
                  <Field label="Office phone" type="tel" value={form.office_phone} onChange={(v) => setField('office_phone', v)} />
                  <Field label="Email" type="email" value={form.email} onChange={(v) => setField('email', v)} />
                  <Field label="Website" type="url" value={form.website} onChange={(v) => setField('website', v)} placeholder="https://yourwebsite.com" />
                  <Field label="Broker licensed or registered name" value={form.brokerage_name} onChange={(v) => setField('brokerage_name', v)} required />
                  <Field label="TREC license number" value={form.license_number} onChange={(v) => setField('license_number', v)} />
                </div>
              </fieldset>
            </div>
          </details>

          <CustomDesignerCanvas
            value={form.custom_design}
            brand={form}
            onChange={(custom_design) => setField('custom_design', custom_design)}
            onLayoutChange={setLayout}
          />

          <details className="rounded-lg border border-gray-200 bg-white">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-800">Additional signature details</summary>
            <div className="grid gap-3 border-t border-gray-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Tagline" value={form.tagline} onChange={(v) => setField('tagline', v)} />
              <Field label="Facebook URL" type="url" value={form.facebook_url} onChange={(v) => setField('facebook_url', v)} />
              <Field label="Instagram URL" type="url" value={form.instagram_url} onChange={(v) => setField('instagram_url', v)} />
              <Field label="X URL" type="url" value={form.x_url} onChange={(v) => setField('x_url', v)} />
              <Field label="LinkedIn URL" type="url" value={form.linkedin_url} onChange={(v) => setField('linkedin_url', v)} />
              <Field label="Office address" value={form.address} onChange={(v) => setField('address', v)} />
              <Field label="Address line 2" value={form.address_2} onChange={(v) => setField('address_2', v)} />
              <Field label="City" value={form.city} onChange={(v) => setField('city', v)} />
              <Field label="State" value={form.state} onChange={(v) => setField('state', v)} />
              <Field label="ZIP" value={form.zip} onChange={(v) => setField('zip', v)} />
            </div>
          </details>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-950">
            <p className="font-semibold">Texas advertising compliance</p>
            <p className="mt-1">The broker licensed or registered assumed business name is a protected, always-visible layer and cannot be deleted or covered by another object.</p>
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {message && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
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

function _BrandPreview({ form }: { form: FormState }) {
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
  const socialIcons = (
    <div className="flex items-center justify-center gap-2" aria-label="Social media">
      {['f', '◎', 't', 'in'].map((social) => (
        <span key={social} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-current text-[11px] font-bold">
          {social}
        </span>
      ))}
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
    case 'banner':
      preview = (
        <div className="grid min-h-44 overflow-hidden border border-gray-300 bg-white shadow-sm sm:grid-cols-[0.78fr_1.35fr_0.9fr]">
          <div className="flex flex-col items-center justify-center bg-[#153f83] px-4 py-3 text-center text-white">
            {headshot}
            <p className="mt-2 max-w-full truncate text-sm font-black">{name}</p>
            <p className="truncate text-[10px] uppercase tracking-[0.28em] text-white">{title}</p>
          </div>
          <div className="flex flex-col justify-center gap-5 px-5 py-4">
            {contactLines}
            <div className="text-[#153f83]">{socialIcons}</div>
          </div>
          <div className="flex items-center justify-center border-t border-gray-200 p-4 sm:border-l-0 sm:border-t-0">
            {companyBlock}
          </div>
        </div>
      );
      break;
    case 'signature':
      preview = (
        <div className="grid min-h-44 overflow-hidden border border-gray-300 bg-white shadow-sm sm:grid-cols-[0.88fr_1.35fr_0.9fr]">
          <div className="relative flex items-center justify-center overflow-hidden bg-[#153f83] p-4">
            <span className="absolute -right-9 h-48 w-48 rounded-full border-[10px] border-[#08ace0]" aria-hidden />
            <div className="relative z-10 scale-110">{headshot}</div>
          </div>
          <div className="flex flex-col justify-center p-4">
            <div className="min-w-0 pb-2">
              <p className="truncate text-base font-black text-[#153f83]">{name}</p>
              <p className="truncate text-[10px] uppercase tracking-[0.25em] text-gray-800">{title}</p>
              <span className="mt-1 block h-0.5 w-10 bg-[#08ace0]" />
            </div>
            <div className="mt-1 flex items-stretch gap-3">
              <span className="w-7 shrink-0 bg-[#08ace0]" aria-hidden />
              {contactLines}
            </div>
          </div>
          <div className="flex flex-col items-center justify-center border-t border-gray-200 p-4 sm:border-t-0">
            {companyBlock}
            <div className="mt-5 text-[#079bce]">{socialIcons}</div>
          </div>
        </div>
      );
      break;
    case 'two-column':
      preview = (
        <div className="overflow-hidden border border-gray-300 bg-white shadow-sm">
          <div className="grid min-h-36 gap-5 px-5 py-4 sm:grid-cols-[1fr_1.25fr_0.75fr]">
            <div className="flex items-center justify-center border-b border-gray-300 pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
              <div className="flex items-center gap-3">
                {logo}
                <p className="max-w-40 text-base font-black uppercase leading-tight text-black">{company}</p>
              </div>
          </div>
            <div className="flex min-w-0 flex-col justify-center">
              <p className="truncate text-base font-black uppercase text-[#064ca7]">{name}</p>
              <p className="truncate text-[10px] uppercase tracking-[0.28em] text-black">{title}</p>
              <div className="mt-2 space-y-1 text-xs font-semibold leading-tight text-black">
                <p>C: {mobile}</p>
                <p>O: {office}</p>
                <p>{email}</p>
                <p>{website}</p>
              </div>
            </div>
            <div className="flex items-center justify-center text-black">
              {socialIcons}
            </div>
          </div>
          <div className="bg-[#222] px-4 py-2.5 text-center font-serif text-base italic text-white">
            {form.tagline || 'As your trusted real estate agent, I provide results that move you'}
          </div>
        </div>
      );
      break;
    case 'business-card':
    default:
      preview = (
        <div className="relative grid min-h-44 overflow-hidden border border-gray-300 bg-white shadow-sm sm:grid-cols-[0.9fr_1.05fr_1.65fr]">
          <div className="flex items-center justify-center p-4">
            {companyBlock}
          </div>
          <div className="flex min-w-0 flex-col justify-center px-5 py-4">
            <p className="truncate text-lg font-bold text-[#153f83]">{name}</p>
            <p className="truncate text-[11px] uppercase tracking-[0.32em] text-black">{title}</p>
            <span className="mt-5 block h-16 w-8 border-t-[10px] border-[#08ace0] bg-[#153f83]" aria-hidden />
          </div>
          <div className="grid grid-cols-2 items-end gap-4 px-4 pb-5 pt-14">
            <div className="space-y-2 text-xs font-semibold text-black">
              <p><span className="text-[#079bce]">◉</span> C: {mobile}</p>
              <p><span className="text-[#079bce]">◉</span> O: {office}</p>
            </div>
            <div className="space-y-2 text-xs font-semibold text-black">
              <p className="truncate"><span className="text-[#079bce]">✉</span> {email}</p>
              <p className="truncate"><span className="text-[#079bce]">◎</span> {website}</p>
            </div>
          </div>
          <div className="absolute right-0 top-3 bg-[#153f83] px-5 py-2 text-[#08ace0]">
            {socialIcons}
          </div>
        </div>
      );
      break;
  }

  return <div className="w-full">{preview}</div>;
}
