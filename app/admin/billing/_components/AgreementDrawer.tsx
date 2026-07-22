'use client';

// app/admin/billing/_components/AgreementDrawer.tsx
//
// Full-feature create/edit drawer for an Agreement row. Includes
// Pressbook-parity rate lookup, CC surcharge, page-position premium,
// month/year timing grid, attachments, signing-link flow, amend flow,
// and the legacy system-fields panel.

import { useMemo, useRef, useState } from 'react';
import type {
  AgreementWithAdvertiser, AgreementStatus, AgreementType, PaymentMode,
} from '@/lib/agreements';
import { formatCents } from '@/lib/invoices';
import {
  MONTHS_LIST, FREQ_PKG_AG, FREQ_MONTHS,
  AD_SIZES, FREQUENCIES, PAYMENT_TYPES, CARD_TYPES, BILL_TO,
} from '@/lib/pressbook-constants';
import { TERMS_RL } from '@/lib/agreement-terms';
import {
  lookupRate, applyCcSurcharge, pagePositionPremium, computeExp,
} from '@/lib/agreement-pricing';
import { formatPhone, formatPhoneInput } from '@/lib/format-phone';
import { DrawerShell, Section, Field } from './DrawerShell';
import { AG_STATUS, AG_TYPES, PAY_MODES, INPUT, INPUT_READONLY } from './constants';
import { toISODateString, humanDate, formatDateISO } from './helpers';
import type { AdvertiserOption, AdCampaignOption } from './types';

type AgForm = {
  // Advertiser info
  company_name: string;
  rep_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  // Insertion order
  ad_size: string;
  frequency: string;
  ad_rate: string;         // display rate (may include CC surcharge)
  ad_rate_base: string;    // base rate before CC
  rate_user_edited: boolean;
  discount: string;
  ad_premium: string;
  pos_premium_active: boolean;
  page_position: string;
  ad_timing_months: Record<string, boolean>;
  ad_timing_years: Record<string, string>;
  // Billing
  bill_to: string;
  billing_email: string;
  billing_contact_name: string;
  billing_contact_phone: string;
  payment_type: string;
  card_type: string;
  cardholder_name: string;
  card_number_last4: string;
  card_expiration: string;
  cardholder_address: string;
  // Signature
  terms_accepted: boolean;
  sign_date: string;
  signer_name: string;
  // Internal
  notes: string;
  status: AgreementStatus;
  // Legacy
  advertiser_id: number | null;
  type: AgreementType | null;
  payment_mode: PaymentMode | null;
  publication: 'austin' | 'san_antonio' | 'both' | null;
  ad_campaign_id: string;
  // Attachments (new files to upload)
  pendingFiles: File[];
};

function initTimingChecked(existing?: AgreementWithAdvertiser | null): Record<string, boolean> {
  const tm = existing?.ad_timing_months;
  return Object.fromEntries(
    MONTHS_LIST.map((m) => [m.k, tm ? !!tm[m.k] : false]),
  );
}

function initTimingYears(existing?: AgreementWithAdvertiser | null): Record<string, string> {
  const tm = existing?.ad_timing_months;
  return Object.fromEntries(
    MONTHS_LIST.map((m) => [m.k, tm?.[m.k] ?? '']),
  );
}

export function AgreementDrawer({
  existing, renewedFrom, advertisers, adCampaigns, onClose, onSaved, onRefresh, onError, onGenerateInvoice,
}: {
  existing?: AgreementWithAdvertiser;
  renewedFrom?: AgreementWithAdvertiser;
  advertisers: AdvertiserOption[];
  adCampaigns: AdCampaignOption[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  /** Reload parent data without closing the drawer. Optional — used for
   *  side-effect updates (file uploads, etc.) that shouldn't dismiss the
   *  drawer the way an explicit Save would. Falls back to a no-op so the
   *  drawer keeps working for callers that don't pass it. */
  onRefresh?: () => Promise<void>;
  onError: (msg: string) => void;
  onGenerateInvoice?: (seed: { advertiser_id: number | null; agreement_id: string; amount_cents: number | null }) => void;
}) {
  const linkedCampaign = useMemo(
    () => existing ? (adCampaigns.find((c) => c.agreement_id === existing.id) ?? null) : null,
    [adCampaigns, existing],
  );

  const seed: AgreementWithAdvertiser | undefined = existing ?? renewedFrom;
  const isCreate = !existing;
  const isUploaded = !!existing?.is_uploaded;

  // “Send amended PDF” flow state. When an admin edits an uploaded paper
  // agreement (or any existing agreement), we expose a button that saves
  // and then emails the regenerated PDF to the advertiser as an FYI —
  // no re-sign required.
  const [sendingAmended, setSendingAmended] = useState(false);
  const [amendedMsg, setAmendedMsg] = useState<string | null>(null);

  // Optional custom message for the “Send Signing Link” email. Empty
  // string → backend falls back to the standard boilerplate.
  const [customMessage, setCustomMessage] = useState<string>('');
  const [showCustomMessage, setShowCustomMessage] = useState<boolean>(false);

  // Derive initial rate from seed or rate table. For fresh creates (no seed), do
  // NOT auto-fill from any default size/frequency — those fields start empty too.
  const initRateAndBase = useMemo(() => {
    if (seed?.ad_rate_cents != null) {
      const payType = seed.payment_mode === 'card' ? 'Credit Card' : 'Check';
      const base = payType === 'Credit Card'
        ? Math.round((seed.ad_rate_cents / 100 / 1.03) * 100) / 100
        : seed.ad_rate_cents / 100;
      return { rate: String(seed.ad_rate_cents / 100), base: String(base) };
    }
    if (seed?.frequency && seed?.ad_size) {
      const looked = lookupRate(seed.frequency, seed.ad_size);
      if (looked) return { rate: String(looked.rate), base: String(looked.rate) };
    }
    return { rate: '', base: '' };
  }, [seed]);

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState<AgForm>({
    company_name:         seed?.company_name ?? '',
    rep_name:             seed?.rep_name ?? '',
    phone:                formatPhone(seed?.advertiser_phone),
    email:                seed?.advertiser_email ?? '',
    address:              seed?.address ?? '',
    city:                 seed?.city ?? '',
    state:                seed?.state ?? '',
    zip:                  seed?.zip ?? '',
    ad_size:              seed?.ad_size ?? '',
    frequency:            seed?.frequency ?? '',
    ad_rate:              initRateAndBase.rate,
    ad_rate_base:         initRateAndBase.base,
    rate_user_edited:     seed?.ad_rate_cents != null,
    discount:             seed?.discount_cents != null ? String(seed.discount_cents / 100) : '',
    ad_premium:           seed?.ad_premium_cents != null ? String(seed.ad_premium_cents / 100) : '',
    pos_premium_active:   false,
    page_position:        seed?.page_position ?? '',
    ad_timing_months:     initTimingChecked(seed),
    ad_timing_years:      initTimingYears(seed),
    bill_to:              seed?.bill_to ?? 'Advertiser',
    billing_email:        seed?.billing_email ?? seed?.advertiser_email ?? '',
    billing_contact_name: seed?.billing_contact_name ?? '',
    billing_contact_phone:formatPhone(seed?.billing_contact_phone),
    payment_type:         seed?.card_type ? 'Credit Card' : (seed?.payment_mode === 'check' ? 'Check' : ''),
    card_type:            seed?.card_type ?? '',
    cardholder_name:      seed?.cardholder_name ?? '',
    card_number_last4:    seed?.card_number_last4 ?? '',
    card_expiration:      seed?.card_expiration ?? '',
    cardholder_address:   seed?.cardholder_address ?? '',
    terms_accepted:       seed?.terms_accepted ?? false,
    sign_date:            toISODateString(existing?.signed_at) || today,
    signer_name:          seed?.signer_name ?? '',
    notes:                existing?.notes ?? (renewedFrom ? `Renewed from agreement ${renewedFrom.id}` : ''),
    status:               (existing?.status ?? 'draft') as AgreementStatus,
    advertiser_id:        seed?.advertiser_id ?? null,
    type:                 (seed?.type ?? null) as AgreementType | null,
    payment_mode:         (seed?.payment_mode ?? null) as PaymentMode | null,
    publication:          (seed?.publication ?? null) as AgForm['publication'],
    ad_campaign_id:       (linkedCampaign?.id ?? '') as string,
    pendingFiles:         [],
  });

  const [saving, setSaving] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Files actively being uploaded to /api/admin/agreements/upload
  // when editing an existing agreement. Keyed by name+size so collisions
  // are unlikely. We show these in the Attachments list with a spinner
  // until the upload resolves and the file is appended to existing.attachments.
  const [uploadingFiles, setUploadingFiles] = useState<Array<{ key: string; name: string; size: number; error?: string }>>([]);
  // Successfully-uploaded files in this session, mirrored locally so the
  // user sees them in the Attachments list without depending on the parent
  // refreshing the `existing` prop. Merged with existing.attachments.files
  // in render — dedup by URL.
  const [localUploadedFiles, setLocalUploadedFiles] = useState<Array<{ name: string; size: number; url: string; uploadedAt: string }>>([]);

  const upd = <K extends keyof AgForm>(k: K, v: AgForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  /**
   * Handle files dropped or chosen via the Attachments drop zone.
   *
   * - Existing agreement: immediately upload each file to
   *   /api/admin/agreements/upload?agreementId=... so the server appends it
   *   to agreements.attachments.files. On success call onSaved() to refresh
   *   the parent list — the new file then shows up in the Existing files list.
   * - New (uncreated) agreement: queue into form.pendingFiles, uploaded on Save.
   */
  async function handleAttachFiles(files: File[]) {
    if (files.length === 0) return;
    if (!existing?.id) {
      upd('pendingFiles', [...form.pendingFiles, ...files]);
      return;
    }
    const additions = files.map((f) => ({ key: `${f.name}__${f.size}__${Math.random().toString(36).slice(2, 8)}`, name: f.name, size: f.size }));
    setUploadingFiles((u) => [...u, ...additions]);
    let anyOk = false;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const key = additions[i].key;
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('agreementId', existing.id);
        const r = await fetch('/api/admin/agreements/upload', { method: 'POST', body: fd });
        if (!r.ok) {
          const detail = await r.text();
          throw new Error(detail || `HTTP ${r.status}`);
        }
        const data = (await r.json()) as { attachment?: { name: string; size: number; url: string; uploadedAt: string } };
        if (data.attachment) {
          setLocalUploadedFiles((prev) => [...prev, data.attachment!]);
        }
        anyOk = true;
        setUploadingFiles((u) => u.filter((x) => x.key !== key));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'upload failed';
        setUploadingFiles((u) => u.map((x) => x.key === key ? { ...x, error: msg } : x));
      }
    }
    if (anyOk && onRefresh) {
      // Optionally refresh parent so the parent list reflects the new files,
      // but keep the drawer open — the admin may still be editing other
      // fields. The drawer also mirrors the upload locally so the user sees
      // the file immediately even if onRefresh isn't provided.
      await onRefresh();
    }
  }

  // Computed values
  const adRate = parseFloat(form.ad_rate) || 0;
  const discount = parseFloat(form.discount) || 0;
  const adPremium = parseFloat(form.ad_premium) || 0;
  const totalMonthly = adRate - discount + adPremium;

  // Expiration preview
  const expPreview = useMemo(() =>
    computeExp(form.ad_timing_months, form.ad_timing_years, form.frequency, form.sign_date),
  [form.ad_timing_months, form.ad_timing_years, form.frequency, form.sign_date]);

  const remindPreview = useMemo(() => {
    if (!expPreview) return '';
    const d = new Date(expPreview + 'T00:00:00');
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, [expPreview]);

  // Auto-fill rate from the rate table when size/freq changes.
  //
  // Historical bug: this used to be gated behind !rate_user_edited, which
  // (because rate_user_edited is initialized to true for any existing
  // agreement) silently froze the ad_rate for every drawer reopen — so
  // editing 1/4-page → 1/2-page or 3x → 6x left the dollar amount stale.
  //
  // Picking a new size/freq pair is an explicit intent change: always
  // recompute the rate from the lookup table and clear the user-edited
  // flag so the "✨ Auto-filled" hint reappears. The manual override path
  // (typing directly into Ad Rate $) still sets rate_user_edited=true.
  const onSizeFrChange = (size: string, freq: string) => {
    const looked = lookupRate(freq, size);
    if (looked) {
      const rate = form.payment_type === 'Credit Card'
        ? String(applyCcSurcharge(looked.rate))
        : String(looked.rate);
      upd('ad_rate', rate);
      upd('ad_rate_base', String(looked.rate));
      upd('rate_user_edited', false);
      // Recalc premium if pos_premium_active
      if (form.pos_premium_active) {
        upd('ad_premium', String(pagePositionPremium(looked.rate)));
      }
    }
  };

  // When payment type changes, recalc rate if CC
  const onPayTypeChange = (pt: string) => {
    upd('payment_type', pt);
    const base = parseFloat(form.ad_rate_base) || 0;
    if (base > 0) {
      const newRate = pt === 'Credit Card' ? String(applyCcSurcharge(base)) : String(base);
      upd('ad_rate', newRate);
    }
  };

  // Toggle pos premium
  const onTogglePosPremium = (active: boolean) => {
    upd('pos_premium_active', active);
    const base = parseFloat(form.ad_rate_base) || 0;
    if (active && base > 0) {
      upd('ad_premium', String(pagePositionPremium(base)));
    } else if (!active) {
      upd('ad_premium', '');
    }
  };

  const campaignChoices = useMemo(() => {
    const eligible = adCampaigns.filter((c) =>
      c.agreement_id === null || (existing && c.agreement_id === existing.id),
    );
    if (form.advertiser_id) {
      const own = eligible.filter((c) => c.advertiser_id === form.advertiser_id);
      const rest = eligible.filter((c) => c.advertiser_id !== form.advertiser_id);
      return [...own, ...rest];
    }
    return eligible;
  }, [adCampaigns, existing, form.advertiser_id]);

  // Admin shortcut signing is allowed ONLY when payment is Check (or no payment).
  // Credit Card must go through the public Sign Wizard so Stripe actually charges —
  // signing here would mark the agreement paid-on-paper without ever hitting Stripe.
  const cardRequiresSigningLink = form.payment_type === 'Credit Card';
  const canSign =
    form.terms_accepted &&
    form.signer_name.trim() !== '' &&
    form.sign_date !== '' &&
    !cardRequiresSigningLink;

  const buildPayload = (isSigning: boolean) => {
    const rateCents = Math.round((parseFloat(form.ad_rate) || 0) * 100);
    const discCents = Math.round((parseFloat(form.discount) || 0) * 100);
    const premCents = Math.round((parseFloat(form.ad_premium) || 0) * 100);
    const totalCents = Math.round(totalMonthly * 100);
    // amount_cents = contract total over the full term. It powers the
    // "Amount" column on the Agreements list — if we only persist
    // ad_rate_cents / total_monthly_rate_cents the list shows "Not set".
    // For print frequencies we multiply monthly × issues; if no frequency
    // is selected fall back to the monthly so the list at least reflects
    // something instead of blanking.
    const issueCount = FREQ_MONTHS[form.frequency] ?? 0;
    const amountCents = issueCount > 0 ? totalCents * issueCount : totalCents;
    const timingMonths: Record<string, string> = {};
    for (const m of MONTHS_LIST) {
      if (form.ad_timing_months[m.k]) timingMonths[m.k] = form.ad_timing_years[m.k] ?? '';
    }

    return {
      company_name:            form.company_name || null,
      rep_name:                form.rep_name || null,
      advertiser_email:        form.email || null,
      advertiser_phone:        form.phone || null,
      address:                 form.address || null,
      city:                    form.city || null,
      state:                   form.state || null,
      zip:                     form.zip || null,
      ad_size:                 form.ad_size || null,
      frequency:               form.frequency || null,
      ad_rate_cents:           rateCents || null,
      discount_cents:          discCents || null,
      ad_premium_cents:        premCents || null,
      total_monthly_rate_cents:totalCents || null,
      amount_cents:            amountCents || null,
      page_position:           form.page_position || null,
      ad_timing_months:        Object.keys(timingMonths).length > 0 ? timingMonths : null,
      bill_to:                 form.bill_to,
      billing_email:           form.billing_email || null,
      billing_contact_name:    form.billing_contact_name || null,
      billing_contact_phone:   form.billing_contact_phone || null,
      payment_type:            form.payment_type || null,
      card_type:               form.payment_type === 'Credit Card' ? form.card_type : null,
      cardholder_name:         form.payment_type === 'Credit Card' ? form.cardholder_name || null : null,
      card_number_last4:       form.payment_type === 'Credit Card' ? form.card_number_last4 || null : null,
      card_expiration:         form.payment_type === 'Credit Card' ? form.card_expiration || null : null,
      cardholder_address:      form.payment_type === 'Credit Card' ? form.cardholder_address || null : null,
      notes:                   form.notes || null,
      status:                  isSigning ? 'signed' : form.status,
      advertiser_id:           form.advertiser_id,
      type:                    form.type || null,
      payment_mode:            form.payment_mode || null,
      publication:             form.publication || null,
      exp_date:                expPreview || null,
      end_date:                expPreview || null,
      signer_name:             isSigning ? form.signer_name || null : form.signer_name || null,
      terms_accepted:          isSigning ? true : form.terms_accepted || null,
      terms_accepted_at:       isSigning ? new Date().toISOString() : null,
      signed_at:               isSigning ? (form.sign_date + 'T00:00:00.000Z') : null,
      is_renewal:              !!renewedFrom,
      renewed_from_id:         renewedFrom?.id ?? null,
    };
  };

  const save = async (isSigning: boolean) => {
    if (!isCreate && !existing) return;
    setSaving(true);
    try {
      const payload = buildPayload(isSigning);
      const url = isCreate ? '/api/admin/agreements' : `/api/admin/agreements/${existing!.id}`;
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved = await res.json();
      const agreementId = saved.agreement?.id ?? existing?.id;

      // Upload pending files
      if (form.pendingFiles.length > 0 && agreementId) {
        const existingFiles = (existing?.attachments?.files ?? []) as Array<Record<string, unknown>>;
        const newFiles: Array<Record<string, unknown>> = [];
        for (const file of form.pendingFiles) {
          const fd = new FormData(); fd.append('file', file);
          const r = await fetch('/api/admin/agreements/upload', { method: 'POST', body: fd });
          if (r.ok) {
            const d = await r.json();
            const uploaded = d.agreement?.attachments?.files?.[0] as Record<string, unknown> | undefined;
            if (uploaded) newFiles.push(uploaded);
          }
        }
        if (newFiles.length > 0) {
          await fetch(`/api/admin/agreements/${agreementId}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ attachments: { files: [...existingFiles, ...newFiles] } }),
          });
        }
      }

      // Sync campaign link if changed
      const previousCampaignId = linkedCampaign?.id ?? '';
      if (agreementId && form.ad_campaign_id !== previousCampaignId) {
        const linkRes = await fetch(`/api/admin/agreements/${agreementId}/link-campaign`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ad_campaign_id: form.ad_campaign_id || null }),
        });
        if (!linkRes.ok) {
          const detail = await linkRes.text();
          throw new Error(`campaign link failed: ${detail}`);
        }
      }

      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  const [signingMsg, setSigningMsg] = useState<string | null>(null);

  // Build the body for /api/admin/agreements/:id/send. Includes the
  // admin’s optional custom pitch when one is filled in.
  const buildSendBody = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (customMessage.trim().length > 0) {
      out.customMessage = customMessage.trim();
    }
    return out;
  };

  const sendSigningLink = async () => {
    setSaving(true);
    setSigningMsg(null);
    try {
      // 1. Save/create the agreement first as draft
      const payload = buildPayload(false);
      const url = isCreate ? '/api/admin/agreements' : `/api/admin/agreements/${existing!.id}`;
      const saveRes = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!saveRes.ok) throw new Error(`Save failed HTTP ${saveRes.status}`);
      const saved = await saveRes.json();
      const agreementId: string = saved.agreement?.id ?? existing?.id ?? '';

      if (!agreementId) throw new Error('No agreement ID after save');

      // 2. POST to send route — builds sign URL + emails it. Includes
      // an optional custom pitch when admin filled one in.
      const sendRes = await fetch(`/api/admin/agreements/${agreementId}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildSendBody()),
      });
      if (!sendRes.ok) throw new Error(`Send failed HTTP ${sendRes.status}`);
      const sendData = await sendRes.json();
      const sentTo: string = sendData.sentTo ?? form.email ?? 'advertiser';
      setSigningMsg(`Signing link sent to ${sentTo}`);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'send link failed');
    } finally {
      setSaving(false);
    }
  };

  const copySigningLink = async () => {
    if (!existing?.id) { onError('Save the agreement first'); return; }
    try {
      const res = await fetch(`/api/admin/agreements/${existing.id}/sign-link`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = await res.json();
      await navigator.clipboard.writeText(url);
      setSigningMsg('Signing link copied to clipboard!');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'copy failed');
    }
  };

  // Save-first, then send with { test: true } so the recipient is FORCED
  // to the current admin's email (server-side, from session). Does NOT
  // mutate the agreement's status / sent_to_email.
  const sendTestEmail = async () => {
    setSaving(true);
    setSigningMsg(null);
    try {
      const payload = buildPayload(false);
      const url = isCreate ? '/api/admin/agreements' : `/api/admin/agreements/${existing!.id}`;
      const saveRes = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!saveRes.ok) throw new Error(`Save failed HTTP ${saveRes.status}`);
      const saved = await saveRes.json();
      const agreementId: string = saved.agreement?.id ?? existing?.id ?? '';
      if (!agreementId) throw new Error('No agreement ID after save');

      const sendRes = await fetch(`/api/admin/agreements/${agreementId}/send?test=1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...buildSendBody(), test: true }),
      });
      if (!sendRes.ok) throw new Error(`Test send failed HTTP ${sendRes.status}`);
      const sendData = await sendRes.json();
      setSigningMsg(`Test email sent to ${sendData.sentTo ?? 'admin'}`);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'test send failed');
    } finally {
      setSaving(false);
    }
  };

  // Amend flow:
  //   1. PATCH the latest edits (no signing flag).
  //   2. POST /send-amended — backend regenerates the PDF from the
  //      just-saved row and emails it to the advertiser as FYI.
  //   3. Refresh the parent list.
  // Asks for an optional "what changed" note that's included in the email
  // body so the advertiser knows why they received an updated copy.
  const saveAndSendAmended = async () => {
    if (!existing?.id) {
      onError('Save the agreement first');
      return;
    }
    const summary = window.prompt(
      'Optional: what changed? (1–2 sentences — included in the email; leave blank for none)',
      '',
    );
    if (summary === null) return; // user cancelled

    setSendingAmended(true);
    setAmendedMsg(null);
    try {
      // 1. Persist current form edits as a normal save.
      const payload = buildPayload(false);
      const patchRes = await fetch(`/api/admin/agreements/${existing.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!patchRes.ok) {
        const t = await patchRes.text();
        throw new Error(`save failed: ${patchRes.status} ${t}`);
      }

      // 2. Send the amended PDF.
      const sendRes = await fetch(
        `/api/admin/agreements/${existing.id}/send-amended`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ changeSummary: summary || undefined }),
        },
      );
      const sendBody = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) {
        throw new Error(
          sendBody?.detail || sendBody?.error || `send failed: ${sendRes.status}`,
        );
      }

      setAmendedMsg(`Updated PDF sent to ${sendBody.sentTo ?? 'advertiser'}`);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'amend failed');
    } finally {
      setSendingAmended(false);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/agreements/${existing.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      title={isCreate
        ? (renewedFrom ? `Renew — ${renewedFrom.company_name ?? renewedFrom.advertiser_name ?? 'agreement'}` : 'New agreement')
        : (existing?.company_name ?? existing?.advertiser_name ?? 'Agreement')}
      subtitle={isCreate
        ? (renewedFrom ? `Draft renewal of ${renewedFrom.id}` : 'Contract — draft by default')
        : existing?.id}
      onClose={onClose}
    >
      {!isCreate && onGenerateInvoice && (
        <div className="rounded-md border border-blue-200 bg-blue-50/60 p-3 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-blue-700 font-medium">Invoice</div>
            <div className="text-sm text-gray-800 mt-0.5">
              {existing && (existing.invoiced_cents > 0
                ? <>Invoiced so far: <span className="font-medium">{formatCents(existing.invoiced_cents)}</span> of {formatCents(existing.amount_cents)}</>
                : <>No invoices yet for this agreement.</>)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onGenerateInvoice({ advertiser_id: existing!.advertiser_id, agreement_id: existing!.id, amount_cents: existing!.amount_cents })}
            className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700"
          >
            Generate invoice
          </button>
        </div>
      )}

      {/* ── Advertiser Information ── */}
      <Section title="Advertiser Information">
        <Field label="Company Name *">
          <input value={form.company_name} onChange={(e) => upd('company_name', e.target.value)}
            className={INPUT} placeholder="Advertiser company name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Representative Name *">
            <input value={form.rep_name} onChange={(e) => upd('rep_name', e.target.value)}
              className={INPUT} placeholder="Full name" />
          </Field>
          <Field label="Contact Number">
            <input value={form.phone}
              onChange={(e) => upd('phone', formatPhoneInput(e.target.value))}
              className={INPUT} placeholder="(000) 000-0000" inputMode="tel" />
          </Field>
          <Field label="Email">
            <input value={form.email} type="email"
              onChange={(e) => upd('email', e.target.value)}
              className={INPUT} placeholder="email@company.com" />
          </Field>
          <Field label="Mailing Address">
            <input value={form.address} onChange={(e) => upd('address', e.target.value)}
              className={INPUT} placeholder="Street address" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="City" className="col-span-1">
            <input value={form.city} onChange={(e) => upd('city', e.target.value)} className={INPUT} placeholder="City" />
          </Field>
          <Field label="State">
            <input value={form.state} maxLength={2}
              onChange={(e) => upd('state', e.target.value.toUpperCase())}
              className={INPUT} placeholder="TX" />
          </Field>
          <Field label="Zip">
            <input value={form.zip} onChange={(e) => upd('zip', e.target.value)} className={INPUT} placeholder="78701" />
          </Field>
        </div>
      </Section>

      {/* ── Insertion Order ── */}
      <Section title="Insertion Order">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Ad Size</div>
            {AD_SIZES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                <input type="radio" name="ag_size" value={s} checked={form.ad_size === s}
                  onChange={() => { upd('ad_size', s); onSizeFrChange(s, form.frequency); }}
                  className="w-4 h-4 accent-blue-600" />
                {s}
              </label>
            ))}
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Frequency</div>
            {FREQUENCIES.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                <input type="radio" name="ag_freq" value={f} checked={form.frequency === f}
                  onChange={() => { upd('frequency', f); onSizeFrChange(form.ad_size, f); }}
                  className="w-4 h-4 accent-blue-600" />
                {f} {FREQ_PKG_AG[f] ? `· ${FREQ_PKG_AG[f]}` : ''}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-600 mb-1">Ad Rate ($)</div>
            {form.payment_type === 'Credit Card' ? (
              <>
                <input value={form.ad_rate} className={INPUT_READONLY} readOnly />
                <div className="text-[10px] text-amber-600 mt-1">
                  +3% CC surcharge (base: ${form.ad_rate_base})
                </div>
              </>
            ) : (
              <input
                type="number"
                value={form.ad_rate}
                onChange={(e) => {
                  upd('ad_rate', e.target.value);
                  upd('ad_rate_base', e.target.value);
                  upd('rate_user_edited', true);
                }}
                className={INPUT}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            )}
            {!form.rate_user_edited && form.ad_rate && (
              <div className="text-[10px] text-gray-400 mt-1">
                ✨ Auto-filled from {FREQ_PKG_AG[form.frequency] ?? form.frequency}
              </div>
            )}
          </div>
          <Field label="Discount ($)">
            <input type="number" value={form.discount}
              onChange={(e) => upd('discount', e.target.value)}
              className={INPUT} placeholder="0.00" min="0" step="0.01" />
          </Field>
          <div>
            <div className="text-xs text-gray-600 mb-1">Ad Premium ($)</div>
            {form.pos_premium_active ? (
              <>
                <input value={form.ad_premium} className={INPUT_READONLY} readOnly />
                <div className="text-[10px] text-gray-400 mt-1">20% page position premium applied</div>
              </>
            ) : (
              <input type="number" value={form.ad_premium}
                onChange={(e) => upd('ad_premium', e.target.value)}
                className={INPUT} placeholder="0.00" min="0" step="0.01" />
            )}
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Total Monthly ($)</div>
            <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm font-bold text-gray-900">
              ${totalMonthly.toFixed(2)}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Rate − Discount + Premium</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Page Position">
            <input value={form.page_position}
              onChange={(e) => upd('page_position', e.target.value)}
              className={INPUT} placeholder="e.g. Inside front cover" />
          </Field>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.pos_premium_active}
                onChange={(e) => onTogglePosPremium(e.target.checked)}
                className="w-4 h-4 accent-blue-600" />
              Apply 20% premium
            </label>
          </div>
        </div>

        {/* Ad Timing grid */}
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Ad Timing Term</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
            {MONTHS_LIST.map((m) => (
              <div key={m.k} className="flex items-center gap-2">
                <input type="checkbox" id={`agm_${m.k}`}
                  checked={!!form.ad_timing_months[m.k]}
                  onChange={(e) => upd('ad_timing_months', { ...form.ad_timing_months, [m.k]: e.target.checked })}
                  className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0" />
                <label htmlFor={`agm_${m.k}`} className="text-sm min-w-[80px] cursor-pointer">{m.l}</label>
                <input
                  id={`agmy_${m.k}`}
                  value={form.ad_timing_years[m.k] ?? ''}
                  disabled={!form.ad_timing_months[m.k]}
                  maxLength={4}
                  onChange={(e) => upd('ad_timing_years', { ...form.ad_timing_years, [m.k]: e.target.value })}
                  className="w-14 px-2 py-1 text-xs rounded-md border border-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
                  placeholder="Year"
                />
              </div>
            ))}
          </div>
          {expPreview && (
            <div className="mt-2 text-xs text-gray-600">
              Expiration: <span className="font-medium text-gray-900">{humanDate(expPreview)}</span>
              {remindPreview && <> · Renewal reminder 30 days before: <span className="font-medium">{humanDate(remindPreview)}</span></>}
            </div>
          )}
        </div>
      </Section>

      {/* ── Billing Information ── */}
      <Section title="Billing Information">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Bill To</div>
          {BILL_TO.map((b) => (
            <label key={b} className="flex items-center gap-2 text-sm cursor-pointer mb-2">
              <input type="radio" name="ag_bill_to" value={b} checked={form.bill_to === b}
                onChange={() => upd('bill_to', b)}
                className="w-4 h-4 accent-blue-600" />
              {b}
            </label>
          ))}
        </div>
        <Field label="Billing Email *">
          <input value={form.billing_email} type="email"
            onChange={(e) => upd('billing_email', e.target.value)}
            className={INPUT} placeholder="billing@company.com" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Billing Contact Name">
            <input value={form.billing_contact_name}
              onChange={(e) => upd('billing_contact_name', e.target.value)}
              className={INPUT} />
          </Field>
          <Field label="Billing Contact Phone">
            <input value={form.billing_contact_phone}
              onChange={(e) => upd('billing_contact_phone', formatPhoneInput(e.target.value))}
              className={INPUT} placeholder="(000) 000-0000" inputMode="tel" />
          </Field>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Payment Type</div>
          {PAYMENT_TYPES.map((pt) => (
            <label key={pt} className="flex items-center gap-2 text-sm cursor-pointer mb-2">
              <input type="radio" name="ag_pay_type" value={pt} checked={form.payment_type === pt}
                onChange={() => onPayTypeChange(pt)}
                className="w-4 h-4 accent-blue-600" />
              {pt}
            </label>
          ))}
        </div>

        {form.payment_type === 'Credit Card' && (
          <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 space-y-3">
            <div className="text-xs text-amber-800 font-medium">A 3% surcharge applies to credit card transactions</div>
            <div className="text-xs text-amber-900 bg-amber-100 border border-amber-300 rounded-md p-2 leading-relaxed">
              <strong>The actual card charge happens on the signing link.</strong>{' '}
              These fields below are reference metadata only — the advertiser will enter their
              card securely via Stripe on the Sign Wizard. Click <em>Send Signing Link</em>{' '}
              (or <em>Copy Link</em>) instead of <em>Sign &amp; Save</em>.
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Card Type</div>
              {CARD_TYPES.map((ct) => (
                <label key={ct} className="flex items-center gap-2 text-sm cursor-pointer mb-1">
                  <input type="radio" name="ag_card_type" value={ct} checked={form.card_type === ct}
                    onChange={() => upd('card_type', ct)}
                    className="w-4 h-4 accent-blue-600" />
                  {ct}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cardholder Name">
                <input value={form.cardholder_name}
                  onChange={(e) => upd('cardholder_name', e.target.value)}
                  className={INPUT} />
              </Field>
              <Field label="Card Number (last 4)">
                <input value={form.card_number_last4} maxLength={4} inputMode="numeric"
                  onChange={(e) => upd('card_number_last4', e.target.value.replace(/\D/g, ''))}
                  className={INPUT} placeholder="1234" />
              </Field>
              <Field label="Expiration MM/YY">
                <input value={form.card_expiration} maxLength={5}
                  onChange={(e) => {
                    let v = e.target.value.replace(/[^\d/]/g, '');
                    if (v.length === 2 && !v.includes('/') && e.target.value.length > form.card_expiration.length) v += '/';
                    upd('card_expiration', v);
                  }}
                  className={INPUT} placeholder="MM/YY" />
              </Field>
              <Field label="Cardholder Address">
                <input value={form.cardholder_address}
                  onChange={(e) => upd('cardholder_address', e.target.value)}
                  className={INPUT} />
              </Field>
            </div>
          </div>
        )}
      </Section>

      {/* ── Terms & Digital Signature (hidden when uploaded) ──
          Uploaded paper agreements are amended via “Save & send amended
          PDF” below instead — the advertiser doesn’t need to re-sign,
          they just receive the updated PDF for their records. */}
      {!isUploaded && (
        <Section title="Terms &amp; Digital Signature">
          <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
            {TERMS_RL}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-2">
            <input type="checkbox" checked={form.terms_accepted}
              onChange={(e) => upd('terms_accepted', e.target.checked)}
              className="w-4 h-4 accent-blue-600" />
            I have read and accept the terms above
          </label>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Signing Date">
              <input type="date" value={form.sign_date}
                onChange={(e) => upd('sign_date', e.target.value)}
                className={INPUT} />
            </Field>
          </div>
          <div className={`rounded-md border-2 p-3 space-y-1 mt-1 ${form.terms_accepted ? 'border-amber-400 bg-amber-50/40' : 'border-gray-200'}`}>
            <div className="text-xs text-gray-600 font-medium">Type your full legal name to sign</div>
            <input value={form.signer_name}
              onChange={(e) => upd('signer_name', e.target.value)}
              className={INPUT} placeholder="Full legal name" />
          </div>
        </Section>
      )}

      {/* ── Internal Notes ── */}
      <Section title="Internal Notes">
        <textarea value={form.notes}
          onChange={(e) => upd('notes', e.target.value)}
          rows={3} className={INPUT + ' resize-y'} />
      </Section>

      {/* ── Attachments ── */}
      <Section title="Attachments">
        {/* Existing files (server-persisted), merged with any uploads that
            completed in this drawer session (so the user sees them without
            relying on a parent refresh). Dedup by URL. */}
        {(() => {
          const serverFiles = (existing?.attachments?.files ?? []) as Array<{ name: string; size: number; url: string }>;
          const seenUrls = new Set(serverFiles.map((f) => f.url));
          const sessionUploads = localUploadedFiles.filter((f) => !seenUrls.has(f.url));
          const allFiles = [...serverFiles, ...sessionUploads];
          if (allFiles.length === 0) return null;
          return (
            <div className="space-y-1">
              {allFiles.map((f, i) => (
                <div key={`${f.url}-${i}`} className="flex items-center gap-2 text-xs text-gray-700">
                  <svg className="w-3 h-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600">{f.name}</a>
                  <span className="text-gray-400">({Math.round(f.size / 1024)}KB)</span>
                </div>
              ))}
            </div>
          );
        })()}
        {/* Files currently uploading (existing agreement only) */}
        {uploadingFiles.length > 0 && (
          <div className="space-y-1">
            {uploadingFiles.map((f) => (
              <div key={f.key} className="flex items-center gap-2 text-xs">
                <svg className="w-3 h-3 text-blue-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                <span className="text-gray-700">{f.name}</span>
                {f.error ? (
                  <>
                    <span className="text-rose-600">— {f.error}</span>
                    <button
                      className="text-rose-500 hover:underline"
                      onClick={() => setUploadingFiles((u) => u.filter((x) => x.key !== f.key))}
                    >×</button>
                  </>
                ) : (
                  <span className="text-gray-400 inline-flex items-center gap-1">
                    <svg className="w-3 h-3 animate-spin text-blue-500" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                      <path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    uploading…
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Pending new files (only for new agreements not yet created) */}
        {form.pendingFiles.length > 0 && (
          <div className="space-y-1">
            {form.pendingFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                <svg className="w-3 h-3 text-amber-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                <span>{f.name}</span>
                <span className="text-gray-400">— will upload on save</span>
                <button className="text-rose-500 hover:underline" onClick={() => upd('pendingFiles', form.pendingFiles.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        {/* Drop zone */}
        <div
          ref={dropRef}
          className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center text-xs text-gray-500 cursor-pointer hover:border-blue-400"
          onClick={() => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.multiple = true;
            inp.onchange = () => {
              if (inp.files) void handleAttachFiles(Array.from(inp.files));
            };
            inp.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            void handleAttachFiles(files);
          }}
        >
          {existing?.id
            ? 'Click or drag files here — they upload immediately'
            : 'Click or drag files here to attach'}
        </div>
      </Section>

      {/* ── Legacy fields (Advertiser link, Type, payment mode, campaign) ── */}
      <Section title="System fields">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Linked advertiser">
            <select value={form.advertiser_id ?? ''} onChange={(e) => upd('advertiser_id', e.target.value ? +e.target.value : null)} className={INPUT}>
              <option value="">— none —</option>
              {advertisers.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.publication}</option>)}
            </select>
          </Field>
          <Field label="Agreement type">
            <select value={form.type ?? ''} onChange={(e) => upd('type', (e.target.value || null) as AgreementType | null)} className={INPUT}>
              <option value="">—</option>
              {AG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => upd('status', e.target.value as AgreementStatus)} className={INPUT}>
              {AG_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Payment mode">
            <select value={form.payment_mode ?? ''} onChange={(e) => upd('payment_mode', (e.target.value || null) as PaymentMode | null)} className={INPUT}>
              <option value="">—</option>
              {PAY_MODES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Publication / Market">
            <select
              value={form.publication ?? ''}
              onChange={(e) => upd('publication', (e.target.value || null) as AgForm['publication'])}
              className={INPUT}
            >
              <option value="">—</option>
              <option value="austin">RealtyLine Austin</option>
              <option value="san_antonio">Newsline San Antonio</option>
              <option value="both">Both</option>
            </select>
          </Field>
        </div>
        <Field label="Linked ad campaign">
          <select value={form.ad_campaign_id} onChange={(e) => upd('ad_campaign_id', e.target.value)} className={INPUT}>
            <option value="">— none —</option>
            {campaignChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.advertiser_name} · {c.ad_space_slug} · {c.publication}
                {' '}({formatDateISO(c.start_date)} → {formatDateISO(c.end_date)})
                {c.active ? '' : ' · inactive'}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      {/* ── Footer ── */}
      {signingMsg && (
        <div className="sticky bottom-[72px] -mx-6 px-6 py-2 bg-indigo-50 border-t border-indigo-200 text-xs text-indigo-800">
          {signingMsg}
        </div>
      )}
      {amendedMsg && (
        <div className="sticky bottom-[72px] -mx-6 px-6 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-800">
          {amendedMsg}
        </div>
      )}

      {/* Custom signing-email message — collapsible. When empty the backend
          falls back to the standard pitch. */}
      {!isUploaded && (
        <div className="-mx-6 px-6 py-3 bg-gray-50 border-t border-gray-200">
          <button
            type="button"
            onClick={() => setShowCustomMessage((v) => !v)}
            className="text-xs font-medium text-indigo-700 hover:text-indigo-900 inline-flex items-center gap-1"
          >
            <span>{showCustomMessage ? '▾' : '▸'}</span>
            <span>
              Custom message for signing email
              {customMessage.trim().length > 0 ? ' (custom)' : ' (using default pitch)'}
            </span>
          </button>
          {showCustomMessage && (
            <div className="mt-2">
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={4}
                placeholder="Leave blank to use the standard pitch. When filled in, this replaces the body paragraph of the signing email."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                <span>Plain text. Greeting, signing link, and signoff are added automatically.</span>
                {customMessage.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCustomMessage('')}
                    className="text-rose-600 hover:text-rose-800"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white border-t border-gray-200 flex items-center gap-2 flex-wrap">
        {/* Delete — existing only */}
        {!isCreate && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="px-4 py-2 rounded-md border border-rose-300 text-rose-700 text-sm hover:bg-rose-50 disabled:opacity-50 whitespace-nowrap"
          >
            Delete
          </button>
        )}

        {!isCreate && (
          <a
            href={`/api/admin/agreements/${existing!.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
          >
            Download PDF
          </a>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap">Cancel</button>
        <button
          onClick={() => save(false)}
          disabled={saving}
          className="px-4 py-2 rounded-md border border-blue-500 bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
          title="Save the agreement with the currently selected status"
        >
          {saving ? 'Saving…' : (isCreate ? 'Save as Draft' : 'Save')}
        </button>
        {!isUploaded && (
          <>
            <button
              onClick={sendSigningLink}
              disabled={saving}
              className="px-4 py-2 rounded-md border border-indigo-300 text-indigo-700 text-sm hover:bg-indigo-50 disabled:opacity-50 whitespace-nowrap"
            >
              Send Signing Link
            </button>
            <button
              onClick={sendTestEmail}
              disabled={saving}
              className="px-4 py-2 rounded-md border border-purple-300 text-purple-700 text-sm hover:bg-purple-50 disabled:opacity-50 whitespace-nowrap"
              title="Send the notification email to yourself (does not touch advertiser record)"
            >
              Email me a test
            </button>
            <button
              onClick={copySigningLink}
              disabled={saving}
              className="px-4 py-2 rounded-md border border-indigo-300 text-indigo-700 text-sm hover:bg-indigo-50 disabled:opacity-50 whitespace-nowrap"
              title="Copy signing link to clipboard"
            >
              Copy Link
            </button>
          </>
        )}
        {/* Amend flow: save current edits, regenerate PDF, email it to
            advertiser as FYI. Available on any existing agreement — most
            useful for uploaded paper records that just need an updated
            copy on file. */}
        {!isCreate && (
          <button
            type="button"
            onClick={saveAndSendAmended}
            disabled={saving || sendingAmended}
            className="px-4 py-2 rounded-md border border-amber-400 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
            title="Save current edits, regenerate the PDF, and email it to the advertiser as an FYI"
          >
            {sendingAmended ? 'Sending…' : 'Save & send amended PDF'}
          </button>
        )}
        <button
          onClick={() => save(true)}
          disabled={saving || !canSign}
          className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            cardRequiresSigningLink
              ? 'Credit Card payments must be signed via the public Sign Wizard so Stripe can charge the card. Use Send Signing Link instead.'
              : !canSign
              ? 'Accept terms, enter signer name and sign date first'
              : ''
          }
        >
          {saving ? 'Saving…' : 'Sign & Save'}
        </button>
      </div>
    </DrawerShell>
  );
}
