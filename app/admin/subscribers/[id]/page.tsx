'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { adminApi } from '@/lib/admin-api';

type Subscriber = Record<string, any> & { id: string };

type EditableState = {
  first_name: string;
  last_name: string;
  title: string;
  license_type: string;
  trec_license_number: string;
  nmls_license_number: string;
  brokerage_name: string;
  mobile: string;
  mailing_address: string;
  mailing_address_2: string;
  city: string;
  state: string;
  zip: string;
  fb_handle: string;
  ig_handle: string;
  li_handle: string;
  birthday_month: string;
  birthday_day: string;
  market: string;
  status: string;
  subscriptions: string;
};

const MARKET_LABEL: Record<string, string> = {
  austin: 'RealtyLine (Austin)',
  san_antonio: 'Newsline (SA)',
};

function fmtDate(s: any): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return String(s); }
}

function fmtVal(v: any): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length === 0 ? '—' : v.join(', ');
  return String(v);
}

function subToForm(sub: Subscriber): EditableState {
  const s = (v: any) => (v === null || v === undefined ? '' : String(v));
  return {
    first_name: s(sub.first_name),
    last_name: s(sub.last_name),
    title: s(sub.title),
    license_type: s(sub.license_type),
    trec_license_number: s(sub.trec_license_number),
    nmls_license_number: s(sub.nmls_license_number),
    brokerage_name: s(sub.brokerage_name),
    mobile: s(sub.mobile),
    mailing_address: s(sub.mailing_address),
    mailing_address_2: s(sub.mailing_address_2),
    city: s(sub.city),
    state: s(sub.state),
    zip: s(sub.zip),
    fb_handle: s(sub.fb_handle),
    ig_handle: s(sub.ig_handle),
    li_handle: s(sub.li_handle),
    birthday_month: s(sub.birthday_month),
    birthday_day: s(sub.birthday_day),
    market: s(sub.market),
    status: s(sub.status),
    subscriptions: Array.isArray(sub.subscriptions) ? sub.subscriptions.join(', ') : s(sub.subscriptions),
  };
}

function formToPatch(form: EditableState, original: Subscriber): Record<string, any> {
  const patch: Record<string, any> = {};

  const requiredText: (keyof EditableState)[] = ['first_name', 'last_name'];
  for (const f of requiredText) {
    const newVal = form[f].trim();
    const oldVal = (original[f] ?? '').toString();
    if (newVal !== oldVal && newVal !== '') patch[f] = newVal;
  }

  const nullableText: (keyof EditableState)[] = [
    'title', 'trec_license_number', 'nmls_license_number', 'brokerage_name',
    'mobile', 'mailing_address', 'mailing_address_2', 'city', 'state', 'zip',
    'fb_handle', 'ig_handle', 'li_handle',
  ];
  for (const f of nullableText) {
    const raw = form[f].trim();
    const newVal: string | null = raw === '' ? null : raw;
    const oldVal = original[f] === undefined || original[f] === null ? null : String(original[f]);
    if (newVal !== oldVal) patch[f] = newVal;
  }

  {
    const raw = form.license_type.trim();
    const newVal = raw === '' ? null : raw;
    const oldVal = original.license_type ?? null;
    if (newVal !== oldVal) patch.license_type = newVal;
  }

  for (const f of ['birthday_month', 'birthday_day'] as const) {
    const raw = form[f].trim();
    const newVal: number | null = raw === '' ? null : Number(raw);
    const oldVal = original[f] === undefined || original[f] === null ? null : Number(original[f]);
    if (newVal !== oldVal) {
      if (newVal !== null && Number.isNaN(newVal)) {
        throw new Error(`${f.replace('_', ' ')} must be a number`);
      }
      patch[f] = newVal;
    }
  }

  for (const f of ['market', 'status'] as const) {
    const newVal = form[f].trim();
    const oldVal = original[f] ?? '';
    if (newVal !== '' && newVal !== oldVal) patch[f] = newVal;
  }

  {
    const newArr = form.subscriptions.split(',').map((x) => x.trim()).filter(Boolean);
    const oldArr: string[] = Array.isArray(original.subscriptions) ? original.subscriptions : [];
    const same = newArr.length === oldArr.length && newArr.every((v, i) => v === oldArr[i]);
    if (!same) patch.subscriptions = newArr;
  }

  return patch;
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="py-2">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5 break-words">{fmtVal(value)}</dd>
    </div>
  );
}

function EditableField({
  label, name, value, onChange, type = 'text', placeholder,
}: {
  label: string;
  name: keyof EditableState;
  value: string;
  onChange: (name: keyof EditableState, v: string) => void;
  type?: 'text' | 'number';
  placeholder?: string;
}) {
  return (
    <div className="py-2">
      <label className="text-xs uppercase tracking-wide text-gray-500 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#1a2a44] focus:border-[#1a2a44]"
      />
    </div>
  );
}

function EditableSelect({
  label, name, value, onChange, options,
}: {
  label: string;
  name: keyof EditableState;
  value: string;
  onChange: (name: keyof EditableState, v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="py-2">
      <label className="text-xs uppercase tracking-wide text-gray-500 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1a2a44] focus:border-[#1a2a44]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded p-5 mb-4">
      <h2 className="text-sm font-semibold text-[#1a2a44] uppercase tracking-wide mb-3">{title}</h2>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6">{children}</dl>
    </section>
  );
}
export default function SubscriberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { admin, loading: authLoading } = useAdmin();

  const [sub, setSub] = useState<Subscriber | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditableState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [sendingLink, setSendingLink] = useState(false);
  const [magicLinkConfirm, setMagicLinkConfirm] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!admin) return;
    setLoading(true);
    adminApi.getSubscriber(id)
      .then((res: { subscriber: Subscriber }) => { setSub(res.subscriber); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [admin, id]);

  function enterEdit() {
    if (!sub) return;
    setForm(subToForm(sub));
    setEditing(true);
    setSaveError(null);
    setActionMsg(null);
  }
  function cancelEdit() {
    setEditing(false); setForm(null); setSaveError(null);
  }
  function updateField(name: keyof EditableState, v: string) {
    setForm((prev) => (prev ? { ...prev, [name]: v } : prev));
  }
  async function save() {
    if (!form || !sub) return;
    setSaveError(null);

    let patch: Record<string, any>;
    try { patch = formToPatch(form, sub); }
    catch (e: any) { setSaveError(e.message || 'Invalid input'); return; }

    if (Object.keys(patch).length === 0) { cancelEdit(); return; }

    setSaving(true);
    try {
      const res: { subscriber: Subscriber; changed: string[] } =
        await adminApi.updateSubscriber(id, patch);
      setSub(res.subscriber);
      setEditing(false); setForm(null);
      setActionMsg({
        kind: 'ok',
        text: res.changed.length === 0
          ? 'No changes to save.'
          : `Saved: ${res.changed.join(', ')}`,
      });
    } catch (err: any) {
      setSaveError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function doSendMagicLink() {
    if (!sub) return;
    setSendingLink(true); setActionMsg(null);
    try {
      await adminApi.sendMagicLinkToSubscriber(id);
      setActionMsg({ kind: 'ok', text: `Magic link sent to ${sub.email}.` });
    } catch (err: any) {
      setActionMsg({ kind: 'err', text: err.message || 'Failed to send magic link' });
    } finally {
      setSendingLink(false); setMagicLinkConfirm(false);
    }
  }

  async function doDeactivate() {
    if (!sub) return;
    setDeactivating(true); setActionMsg(null);
    try {
      const res: { subscriber: Subscriber; changed: boolean } =
        await adminApi.deactivateSubscriber(id);
      setSub(res.subscriber);
      setActionMsg({
        kind: 'ok',
        text: res.changed ? 'Subscriber deactivated.' : 'Subscriber was already inactive.',
      });
    } catch (err: any) {
      setActionMsg({ kind: 'err', text: err.message || 'Failed to deactivate' });
    } finally {
      setDeactivating(false); setDeactivateConfirm(false);
    }
  }

  async function doDelete() {
    if (!sub) return;
    setDeleting(true);
    try {
      await adminApi.deleteSubscriber(id);
      router.push('/admin/subscribers');
    } catch (err: any) {
      setActionMsg({ kind: 'err', text: err.message || 'Failed to delete' });
      setDeleting(false);
      setDeleteModalOpen(false);
      setDeleteConfirmText('');
    }
  }

  if (authLoading || !admin) {
    return <div className="max-w-5xl mx-auto px-6 py-12 text-sm text-gray-500">Loading...</div>;
  }

  const f = form;
  const deleteEnabled = sub && deleteConfirmText.trim().toLowerCase() === sub.email.toLowerCase();
return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <Link href="/admin/subscribers" className="text-sm text-gray-500 hover:text-[#1a2a44]">
          ← Back to Subscribers
        </Link>
        {!loading && !error && sub && !editing && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={enterEdit}
              className="text-sm font-medium px-4 py-1.5 rounded bg-[#1a2a44] text-white hover:bg-[#021D40]"
            >
              Edit
            </button>
          </div>
        )}
        {editing && (
          <div className="flex gap-2">
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="text-sm font-medium px-4 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="text-sm font-medium px-4 py-1.5 rounded bg-[#1a2a44] text-white hover:bg-[#021D40] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {actionMsg && (
        <div className={`mb-4 px-4 py-2 rounded text-sm border ${
          actionMsg.kind === 'ok'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {actionMsg.text}
        </div>
      )}
      {saveError && (
        <div className="mb-4 px-4 py-2 rounded text-sm border bg-red-50 border-red-200 text-red-800">
          Save error: {saveError}
        </div>
      )}

      {loading && <div className="text-sm text-gray-500 py-8">Loading subscriber...</div>}
      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-4">
          Error: {error}
        </div>
      )}

      {!loading && !error && sub && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-[#1a2a44] tracking-tight">
              {fmtVal(sub.first_name)} {fmtVal(sub.last_name)}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{fmtVal(sub.email)}</p>
            <p className="text-xs text-gray-400 mt-1 font-mono">{sub.id}</p>
            {sub.status === 'inactive' && (
              <span className="inline-block mt-2 px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800 border border-yellow-200">
                INACTIVE
              </span>
            )}
          </div>

          <Section title="Identity">
            {editing && f ? (
              <>
                <EditableField label="First name" name="first_name" value={f.first_name} onChange={updateField} />
                <EditableField label="Last name" name="last_name" value={f.last_name} onChange={updateField} />
                <Field label="Email (read-only)" value={sub.email} />
                <Field label="Email verified" value={sub.email_verified_at ? fmtDate(sub.email_verified_at) : null} />
                <EditableSelect label="Market" name="market" value={f.market} onChange={updateField} options={[
                  { value: 'austin', label: 'RealtyLine (Austin)' },
                  { value: 'san_antonio', label: 'Newsline (SA)' },
                ]} />
                <EditableSelect label="Status" name="status" value={f.status} onChange={updateField} options={[
                  { value: 'active', label: 'active' },
                  { value: 'inactive', label: 'inactive' },
                ]} />
                <EditableField label="Title" name="title" value={f.title} onChange={updateField} />
              </>
            ) : (
              <>
                <Field label="First name" value={sub.first_name} />
                <Field label="Last name" value={sub.last_name} />
                <Field label="Email" value={sub.email} />
                <Field label="Email verified" value={sub.email_verified_at ? fmtDate(sub.email_verified_at) : null} />
                <Field label="Market" value={MARKET_LABEL[sub.market] || sub.market} />
                <Field label="Status" value={sub.status} />
                <Field label="Title" value={sub.title} />
              </>
            )}
          </Section>

          <Section title="License">
            {editing && f ? (
              <>
                <EditableSelect label="License type" name="license_type" value={f.license_type} onChange={updateField} options={[
                  { value: '', label: '— none —' },
                  { value: 'TREC', label: 'TREC' },
                  { value: 'NMLS', label: 'NMLS' },
                ]} />
                <EditableField label="TREC number" name="trec_license_number" value={f.trec_license_number} onChange={updateField} />
                <EditableField label="NMLS number" name="nmls_license_number" value={f.nmls_license_number} onChange={updateField} />
                <EditableField label="Brokerage" name="brokerage_name" value={f.brokerage_name} onChange={updateField} />
                <Field label="TREC status (read-only)" value={sub.trec_license_status} />
                <Field label="License verified at" value={sub.license_verified_at ? fmtDate(sub.license_verified_at) : null} />
              </>
            ) : (
              <>
                <Field label="License type" value={sub.license_type} />
                <Field label="TREC number" value={sub.trec_license_number} />
                <Field label="TREC status" value={sub.trec_license_status} />
                <Field label="NMLS number" value={sub.nmls_license_number} />
                <Field label="Brokerage" value={sub.brokerage_name} />
                <Field label="License verified at" value={sub.license_verified_at ? fmtDate(sub.license_verified_at) : null} />
              </>
            )}
          </Section>

          <Section title="Contact">
            {editing && f ? (
              <>
                <EditableField label="Mobile" name="mobile" value={f.mobile} onChange={updateField} placeholder="555-555-5555" />
                <EditableField label="Mailing address" name="mailing_address" value={f.mailing_address} onChange={updateField} />
                <EditableField label="Address line 2" name="mailing_address_2" value={f.mailing_address_2} onChange={updateField} />
                <EditableField label="City" name="city" value={f.city} onChange={updateField} />
                <EditableField label="State" name="state" value={f.state} onChange={updateField} placeholder="TX" />
                <EditableField label="ZIP" name="zip" value={f.zip} onChange={updateField} />
              </>
            ) : (
              <>
                <Field label="Mobile" value={sub.mobile || sub.mobile_phone} />
                <Field label="Mailing address" value={sub.mailing_address || sub.mailing_address_line1} />
                <Field label="Address line 2" value={sub.mailing_address_2 || sub.mailing_address_line2} />
                <Field label="City" value={sub.city || sub.mailing_city} />
                <Field label="State" value={sub.state || sub.mailing_state} />
                <Field label="ZIP" value={sub.zip || sub.mailing_zip} />
              </>
            )}
          </Section>

          <Section title="Social handles">
            {editing && f ? (
              <>
                <EditableField label="Facebook" name="fb_handle" value={f.fb_handle} onChange={updateField} />
                <EditableField label="Instagram" name="ig_handle" value={f.ig_handle} onChange={updateField} />
                <EditableField label="LinkedIn" name="li_handle" value={f.li_handle} onChange={updateField} />
              </>
            ) : (
              <>
                <Field label="Facebook" value={sub.fb_handle} />
                <Field label="Instagram" value={sub.ig_handle} />
                <Field label="LinkedIn" value={sub.li_handle} />
              </>
            )}
          </Section>

          <Section title="Birthday">
            {editing && f ? (
              <>
                <EditableField label="Month (1-12)" name="birthday_month" value={f.birthday_month} onChange={updateField} type="number" />
                <EditableField label="Day (1-31)" name="birthday_day" value={f.birthday_day} onChange={updateField} type="number" />
                <Field label="Birthday consent (read-only)" value={sub.birthday_consent_at ? fmtDate(sub.birthday_consent_at) : null} />
              </>
            ) : (
              <>
                <Field label="Month" value={sub.birthday_month || sub.birth_month} />
                <Field label="Day" value={sub.birthday_day || sub.birth_day} />
                <Field label="Birthday consent" value={sub.birthday_consent_at ? fmtDate(sub.birthday_consent_at) : null} />
              </>
            )}
          </Section>
<Section title="Subscriptions">
            {editing && f ? (
              <EditableField
                label="Active subscriptions (comma-separated)"
                name="subscriptions"
                value={f.subscriptions}
                onChange={updateField}
                placeholder="newsletter, events"
              />
            ) : (
              <Field label="Active subscriptions" value={sub.subscriptions} />
            )}
          </Section>

          <Section title="Consent (read-only)">
            <Field label="Master list consent" value={sub.master_list_consent_at ? fmtDate(sub.master_list_consent_at) : null} />
            <Field label="Master list IP" value={sub.master_list_consent_ip} />
            <Field label="Master list text" value={sub.master_list_consent_text} />
            <Field label="SMS consent" value={sub.mobile_sms_consent_at ? fmtDate(sub.mobile_sms_consent_at) : null} />
            <Field label="SMS consent text" value={sub.mobile_sms_consent_text} />
          </Section>

          <Section title="Activity (read-only)">
            <Field label="Created" value={fmtDate(sub.created_at)} />
            <Field label="Updated" value={fmtDate(sub.updated_at)} />
            <Field label="Last login" value={sub.last_login_at ? fmtDate(sub.last_login_at) : null} />
            <Field label="Last app open" value={sub.last_app_open_at ? fmtDate(sub.last_app_open_at) : null} />
          </Section>

          {!editing && (
            <section className="bg-white border border-gray-200 rounded p-5 mt-8">
              <h2 className="text-sm font-semibold text-[#1a2a44] uppercase tracking-wide mb-4">Actions</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm text-gray-700">
                    <div className="font-medium">Send login magic link</div>
                    <div className="text-xs text-gray-500">Emails a 15-minute login link to {sub.email}.</div>
                  </div>
                  {magicLinkConfirm ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setMagicLinkConfirm(false)}
                        disabled={sendingLink}
                        className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={doSendMagicLink}
                        disabled={sendingLink}
                        className="text-sm font-medium px-3 py-1.5 rounded bg-[#1a2a44] text-white hover:bg-[#021D40] disabled:opacity-50"
                      >
                        {sendingLink ? 'Sending…' : 'Confirm send'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setMagicLinkConfirm(true); setActionMsg(null); }}
                      className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Send magic link
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-gray-100">
                  <div className="text-sm text-gray-700">
                    <div className="font-medium">Deactivate subscriber</div>
                    <div className="text-xs text-gray-500">
                      Sets status to inactive.{' '}
                      <span className="italic">Login is not yet gated on status — flag-only for now.</span>
                    </div>
                  </div>
                  {sub.status === 'inactive' ? (
                    <span className="text-xs text-gray-400">Already inactive</span>
                  ) : deactivateConfirm ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDeactivateConfirm(false)}
                        disabled={deactivating}
                        className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={doDeactivate}
                        disabled={deactivating}
                        className="text-sm font-medium px-3 py-1.5 rounded bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50"
                      >
                        {deactivating ? 'Deactivating…' : 'Confirm deactivate'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setDeactivateConfirm(true); setActionMsg(null); }}
                      className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Deactivate
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-gray-100">
                  <div className="text-sm text-gray-700">
                    <div className="font-medium text-[#DB1924]">Delete subscriber</div>
                    <div className="text-xs text-gray-500">
                      Hard delete. Removes RSVPs, notification deliveries, magic links, subscriptions, and push tokens.
                      Email log entries are preserved with the realtor_id nulled.
                    </div>
                  </div>
                  <button
                    onClick={() => { setDeleteModalOpen(true); setDeleteConfirmText(''); setActionMsg(null); }}
                    className="text-sm font-medium px-3 py-1.5 rounded border border-[#DB1924] text-[#DB1924] hover:bg-red-50"
                  >
                    Delete…
                  </button>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {deleteModalOpen && sub && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#DB1924]">Delete this subscriber?</h3>
            <p className="text-sm text-gray-700 mt-2">
              This will hard-delete <span className="font-medium">{sub.email}</span> and cascade to their
              RSVPs, notification deliveries, magic links, subscriptions, and push tokens. Email log entries
              will be preserved with the realtor_id nulled. <strong>This cannot be undone.</strong>
            </p>
            <p className="text-sm text-gray-700 mt-4">
              Type the subscriber's email to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={sub.email}
              autoFocus
              className="mt-2 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#DB1924] focus:border-[#DB1924]"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => { setDeleteModalOpen(false); setDeleteConfirmText(''); }}
                disabled={deleting}
                className="text-sm px-4 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={doDelete}
                disabled={!deleteEnabled || deleting}
                className="text-sm font-medium px-4 py-1.5 rounded bg-[#DB1924] text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Delete subscriber'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
