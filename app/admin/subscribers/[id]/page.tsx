'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { adminApi } from '@/lib/admin-api';

type Subscriber = Record<string, any> & { id: string };

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

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="py-2">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5 break-words">{fmtVal(value)}</dd>
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
  const { admin, loading: authLoading } = useAdmin();
  const [sub, setSub] = useState<Subscriber | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) return;
    setLoading(true);
    adminApi.getSubscriber(id)
      .then((res: { subscriber: Subscriber }) => { setSub(res.subscriber); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [admin, id]);

  if (authLoading || !admin) {
    return <div className="max-w-5xl mx-auto px-6 py-12 text-sm text-gray-500">Loading...</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/admin/subscribers" className="text-sm text-gray-500 hover:text-[#1a2a44]">← Back to Subscribers</Link>
      </div>

      {loading && <div className="text-sm text-gray-500 py-8">Loading subscriber...</div>}
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-4">Error: {error}</div>}

      {!loading && !error && sub && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-[#1a2a44] tracking-tight">
              {fmtVal(sub.first_name)} {fmtVal(sub.last_name)}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{fmtVal(sub.email)}</p>
            <p className="text-xs text-gray-400 mt-1 font-mono">{sub.id}</p>
          </div>

          <Section title="Identity">
            <Field label="First name" value={sub.first_name} />
            <Field label="Last name" value={sub.last_name} />
            <Field label="Email" value={sub.email} />
            <Field label="Email verified" value={sub.email_verified_at ? fmtDate(sub.email_verified_at) : null} />
            <Field label="Market" value={MARKET_LABEL[sub.market] || sub.market} />
            <Field label="Status" value={sub.status} />
            <Field label="Title" value={sub.title} />
          </Section>

          <Section title="License">
            <Field label="License type" value={sub.license_type} />
            <Field label="TREC number" value={sub.trec_license_number} />
            <Field label="TREC status" value={sub.trec_license_status} />
            <Field label="NMLS number" value={sub.nmls_license_number} />
            <Field label="Brokerage" value={sub.brokerage_name} />
            <Field label="License verified at" value={sub.license_verified_at ? fmtDate(sub.license_verified_at) : null} />
          </Section>

          <Section title="Contact">
            <Field label="Mobile" value={sub.mobile || sub.mobile_phone} />
            <Field label="Mailing address" value={sub.mailing_address || sub.mailing_address_line1} />
            <Field label="Address line 2" value={sub.mailing_address_2 || sub.mailing_address_line2} />
            <Field label="City" value={sub.city || sub.mailing_city} />
            <Field label="State" value={sub.state || sub.mailing_state} />
            <Field label="ZIP" value={sub.zip || sub.mailing_zip} />
          </Section>

          <Section title="Social handles">
            <Field label="Facebook" value={sub.fb_handle} />
            <Field label="Instagram" value={sub.ig_handle} />
            <Field label="LinkedIn" value={sub.li_handle} />
          </Section>

          <Section title="Birthday">
            <Field label="Month" value={sub.birthday_month || sub.birth_month} />
            <Field label="Day" value={sub.birthday_day || sub.birth_day} />
            <Field label="Birthday consent" value={sub.birthday_consent_at ? fmtDate(sub.birthday_consent_at) : null} />
          </Section>

          <Section title="Subscriptions">
            <Field label="Active subscriptions" value={sub.subscriptions} />
          </Section>

          <Section title="Consent">
            <Field label="Master list consent" value={sub.master_list_consent_at ? fmtDate(sub.master_list_consent_at) : null} />
            <Field label="Master list IP" value={sub.master_list_consent_ip} />
            <Field label="Master list text" value={sub.master_list_consent_text} />
            <Field label="SMS consent" value={sub.mobile_sms_consent_at ? fmtDate(sub.mobile_sms_consent_at) : null} />
            <Field label="SMS consent text" value={sub.mobile_sms_consent_text} />
          </Section>

          <Section title="Activity">
            <Field label="Created" value={fmtDate(sub.created_at)} />
            <Field label="Updated" value={fmtDate(sub.updated_at)} />
            <Field label="Last login" value={sub.last_login_at ? fmtDate(sub.last_login_at) : null} />
            <Field label="Last app open" value={sub.last_app_open_at ? fmtDate(sub.last_app_open_at) : null} />
          </Section>

          <div className="mt-8 pt-6 border-t border-gray-200 text-xs text-gray-400">
            Edit, deactivate, delete, and send-magic-link actions ship in Phase B–C.
          </div>
        </>
      )}
    </div>
  );
}
