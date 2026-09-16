'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, Clock3, ExternalLink, Loader2, Mail, Phone, Search, X } from 'lucide-react';
import type { ReferralApplicationStatus, ReferralNetworkApplication } from '@/lib/server/referral-network-applications';

const STATUSES: Array<{ id: ReferralApplicationStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'pending', label: 'Pending' }, { id: 'contacted', label: 'Contacted' },
  { id: 'approved', label: 'Approved' }, { id: 'declined', label: 'Declined' },
];

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

export default function ReferralNetworkApplicationsClient() {
  const [rows, setRows] = useState<ReferralNetworkApplication[]>([]);
  const [filter, setFilter] = useState<ReferralApplicationStatus | 'all'>('pending');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/admin/referral-network/applications${filter === 'all' ? '' : `?status=${filter}`}`);
        const payload = await response.json() as { rows?: ReferralNetworkApplication[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Unable to load applications.');
        if (!cancelled) setRows(payload.rows ?? []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load applications.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filter]);
  const filteredRows = useMemo(() => rows.filter((row) => `${row.company_name} ${row.contact_name} ${row.email} ${row.categories.join(' ')}`.toLowerCase().includes(query.toLowerCase())), [query, rows]);
  const selected = filteredRows.find((row) => row.id === selectedId) ?? rows.find((row) => row.id === selectedId) ?? null;

  const openApplication = (row: ReferralNetworkApplication) => {
    setSelectedId(row.id);
    setReviewNotes(row.review_notes ?? '');
  };

  const updateStatus = async (status: ReferralApplicationStatus) => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/referral-network/applications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, status, reviewNotes }),
      });
      const payload = await response.json() as { application?: ReferralNetworkApplication; error?: string };
      if (!response.ok || !payload.application) throw new Error(payload.error || 'Unable to save the review.');
      setRows((current) => current.map((row) => row.id === payload.application!.id ? payload.application! : row));
      setSelectedId(payload.application.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the review.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7059A8]">Admin · Sales</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Referral Network</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Review provider applications, record outreach, and approve only the companies ready for a featured agent-facing presence.</p>
        </div>
        <a href="/agents/partner-application" target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#301D5D] px-4 py-2 text-sm font-bold text-[#301D5D] transition hover:bg-[#301D5D] hover:text-white">Open public application <ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
      </div>

      <div className="mt-7 flex flex-col gap-4 border-y border-slate-200 bg-white py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">{STATUSES.map((status) => <button key={status.id} onClick={() => { setFilter(status.id); setSelectedId(null); }} className={`min-h-[40px] rounded-full border px-3.5 py-2 text-sm font-semibold transition ${filter === status.id ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-slate-200 text-slate-700 hover:border-[#301D5D]'}`}>{status.label}</button>)}</div>
        <label className="relative block min-w-[230px]"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search applications" className="min-h-[42px] w-full rounded-full border border-slate-300 pl-9 pr-4 text-sm outline-none focus:border-[#301D5D]" /></label>
      </div>

      {error && <p role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-6 grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <section className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4"><p className="text-sm font-semibold text-slate-900">{loading ? 'Loading applications…' : `${filteredRows.length} application${filteredRows.length === 1 ? '' : 's'}`}</p></div>
          {loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#301D5D]" /></div> : filteredRows.length === 0 ? <div className="p-7 text-sm leading-6 text-slate-600">No applications match this view yet.</div> : <div className="divide-y divide-slate-100">{filteredRows.map((row) => <button key={row.id} onClick={() => openApplication(row)} className={`block w-full p-5 text-left transition hover:bg-[#FCFBF9] ${selectedId === row.id ? 'bg-[#F4F0FC] ring-1 ring-inset ring-[#B6A6D8]' : ''}`}><div className="flex items-start justify-between gap-3"><div><p className="text-base font-semibold text-slate-950">{row.company_name}</p><p className="mt-1 text-sm text-slate-600">{row.contact_name}</p></div><StatusPill status={row.status} /></div><p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#7059A8]">{row.categories.join(' · ')}</p><p className="mt-2 text-xs text-slate-500">Received {formatDate(row.created_at)}</p></button>)}</div>}
        </section>

        <section className="border border-slate-200 bg-white">
          {!selected ? <div className="flex min-h-[480px] flex-col items-center justify-center p-8 text-center"><CircleAlert className="h-9 w-9 text-[#7059A8]" /><h2 className="mt-4 text-xl font-semibold text-slate-950">Choose an Application to Review</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">Select a provider from the queue to see its service information, credentials, and review history.</p></div> : <div className="p-6 sm:p-8"><div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7059A8]">Application #{selected.id}</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{selected.company_name}</h2><p className="mt-2 text-sm text-slate-600">{selected.categories.join(' · ')}</p></div><StatusPill status={selected.status} /></div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2"><Data label="Contact" value={selected.contact_name} /><Data label="Email" value={selected.email} icon={<Mail className="h-4 w-4" />} href={`mailto:${selected.email}`} /><Data label="Phone" value={selected.phone} icon={<Phone className="h-4 w-4" />} href={`tel:${selected.phone}`} /><Data label="Service areas" value={selected.service_areas} /><Data label="License" value={[selected.license_number, selected.license_state, selected.license_expires_on ? `expires ${formatDate(selected.license_expires_on)}` : ''].filter(Boolean).join(' · ') || 'Not provided'} /><Data label="Insurance" value={[selected.insurance_carrier, selected.insurance_expires_on ? `expires ${formatDate(selected.insurance_expires_on)}` : ''].filter(Boolean).join(' · ') || 'Not provided'} /></div>
            {(selected.website || selected.license_verification_url) && <div className="mt-5 flex flex-wrap gap-3">{selected.website && <a target="_blank" rel="noreferrer" href={selected.website} className="inline-flex items-center gap-1 text-sm font-bold text-[#301D5D] hover:underline">Company website <ExternalLink className="h-3.5 w-3.5" /></a>}{selected.license_verification_url && <a target="_blank" rel="noreferrer" href={selected.license_verification_url} className="inline-flex items-center gap-1 text-sm font-bold text-[#301D5D] hover:underline">Verify license <ExternalLink className="h-3.5 w-3.5" /></a>}</div>}
            {(selected.coverage_notes || selected.message) && <div className="mt-6 grid gap-4 sm:grid-cols-2">{selected.coverage_notes && <Note label="Coverage notes" value={selected.coverage_notes} />}{selected.message && <Note label="Provider notes" value={selected.message} />}</div>}
            <div className="mt-7 border-t border-slate-200 pt-6"><label className="block"><span className="text-sm font-semibold text-slate-800">Review notes</span><textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-[#301D5D] focus:ring-2 focus:ring-[#301D5D]/15" placeholder="Record credential checks, pricing conversation, follow-up, or approval conditions." /></label><div className="mt-5 flex flex-wrap gap-2"><button disabled={saving} onClick={() => void updateStatus('contacted')} className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-[#B89B42] bg-[#FFF9E7] px-4 py-2 text-sm font-bold text-[#815F10] disabled:opacity-60"><Clock3 className="h-4 w-4" /> Mark contacted</button><button disabled={saving} onClick={() => void updateStatus('approved')} className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#5B824D] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"><Check className="h-4 w-4" /> Approve</button><button disabled={saving} onClick={() => void updateStatus('declined')} className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-60"><X className="h-4 w-4" /> Decline</button>{saving && <Loader2 className="h-5 w-5 animate-spin text-[#301D5D]" />}</div>{selected.reviewed_at && <p className="mt-4 text-xs text-slate-500">Last reviewed {formatDate(selected.reviewed_at)} by {selected.reviewed_by || 'admin'}.</p>}</div>
          </div>}
        </section>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: ReferralApplicationStatus }) {
  const classes: Record<ReferralApplicationStatus, string> = { pending: 'bg-[#F4F0FC] text-[#5B438C]', contacted: 'bg-[#FFF9E7] text-[#815F10]', approved: 'bg-[#EEF4EA] text-[#46633D]', declined: 'bg-red-50 text-red-700' };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${classes[status]}`}>{status}</span>;
}

function Data({ label, value, icon, href }: { label: string; value: string; icon?: React.ReactNode; href?: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</p>{href ? <a href={href} className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-[#301D5D] hover:underline">{icon}{value}</a> : <p className="mt-1 text-sm leading-6 text-slate-800">{value}</p>}</div>;
}

function Note({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#FCFBF9] p-4"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p></div>;
}
