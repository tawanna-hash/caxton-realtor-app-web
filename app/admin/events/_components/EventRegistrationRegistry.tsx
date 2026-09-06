'use client';

import { useEffect, useMemo, useState } from 'react';

type Registration = {
  id: number;
  full_name: string;
  company: string;
  is_realtor: boolean;
  license_number: string | null;
  email: string;
  mobile: string;
  registered_at: string;
  notification_sent_at: string | null;
};

type RegistryResponse = {
  ok: boolean;
  registrations: Registration[];
  error?: string;
};

function csvCell(value: string | boolean | null): string {
  const text = value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export default function EventRegistrationRegistry({
  eventId,
  eventTitle,
  organizerEmail,
}: {
  eventId: number;
  eventTitle: string;
  organizerEmail: string | null;
}) {
  const [rows, setRows] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipient, setRecipient] = useState(organizerEmail || '');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/events/${eventId}/registrations`, { credentials: 'include' })
      .then(async (res) => {
        const body = (await res.json()) as RegistryResponse;
        if (!res.ok) throw new Error(body.error || 'Failed to load registry.');
        if (!cancelled) setRows(body.registrations || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load registry.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [eventId]);

  const csv = useMemo(() => {
    const header = ['Name', 'Company', 'REALTOR', 'License Number', 'Email', 'Mobile', 'Registered At'];
    return [
      header.map(csvCell).join(','),
      ...rows.map((r) => [
        r.full_name,
        r.company,
        r.is_realtor ? 'Yes' : 'No',
        r.license_number,
        r.email,
        r.mobile,
        r.registered_at,
      ].map(csvCell).join(',')),
    ].join('\r\n');
  }, [rows]);

  function downloadCsv() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}-attendees.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function emailRegistry() {
    if (!recipient.trim()) {
      setError('Enter the partner email address.');
      return;
    }
    if (!window.confirm(`Email ${rows.length} attendee record${rows.length === 1 ? '' : 's'} to ${recipient.trim()}?`)) return;
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/registrations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: recipient.trim() }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error || 'Email failed.');
      setMessage(`Registry emailed to ${recipient.trim()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email failed.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mb-8 rounded-md border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-950">Attendee registry</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            Used when this event has no external registration link. New registrations
            notify you immediately; partner delivery remains a manual action.
          </p>
        </div>
        <div className="text-sm font-semibold text-brand-700">
          {loading ? 'Loading…' : `${rows.length} registered`}
        </div>
      </div>

      {!loading && rows.length > 0 && (
        <>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">Company</th>
                  <th className="pb-2 pr-4 font-medium">REALTOR / License</th>
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Mobile</th>
                  <th className="pb-2 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4 font-medium text-gray-950">{r.full_name}</td>
                    <td className="py-3 pr-4 text-gray-700">{r.company}</td>
                    <td className="py-3 pr-4 text-gray-700">
                      {r.is_realtor ? 'Yes' : 'No'}{r.license_number ? ` · ${r.license_number}` : ''}
                    </td>
                    <td className="py-3 pr-4"><a className="text-brand-700 hover:underline" href={`mailto:${r.email}`}>{r.email}</a></td>
                    <td className="py-3 pr-4"><a className="text-brand-700 hover:underline" href={`tel:${r.mobile}`}>{r.mobile}</a></td>
                    <td className="py-3 text-gray-500 whitespace-nowrap">{new Date(r.registered_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-end">
            <label className="flex-1">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">Partner email</span>
              <input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="partner@example.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <button type="button" onClick={downloadCsv} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">
              Download CSV
            </button>
            <button type="button" onClick={emailRegistry} disabled={sending} className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">
              {sending ? 'Sending…' : 'Email registry to partner'}
            </button>
          </div>
        </>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-500">
          No registrations yet.
        </p>
      )}
      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>}
    </section>
  );
}
