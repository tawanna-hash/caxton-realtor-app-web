'use client';

// app/admin/team/TeamClient.tsx
//
// Team roster table + "Add admin" form. Add sends an invite email with a
// set-password link; Deactivate/Reactivate toggles login access instantly;
// Delete permanently removes an already-deactivated account.

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Admin {
  id: string;
  email: string;
  fullName: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  isOwner: boolean;
}

type Props = {
  initialAdmins: Admin[];
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className="inline-block text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{
        backgroundColor: active ? '#dcfce7' : '#f3f4f6',
        color: active ? '#166534' : '#6b7280',
      }}
    >
      {active ? 'Active' : 'Deactivated'}
    </span>
  );
}

export default function TeamClient({ initialAdmins }: Props) {
  const router = useRouter();
  const [admins] = useState(initialAdmins);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [addedNote, setAddedNote] = useState<string | null>(null);

  const activeCount = useMemo(() => admins.filter((a) => a.active).length, [admins]);

  const addAdmin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);
      setSubmitting(true);
      try {
        const res = await fetch('/api/admin/team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, fullName }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setFormError(j?.error || 'Failed to add admin');
          return;
        }
        setAddedNote(
          j.inviteEmailSent
            ? `Invite sent to ${email}.`
            : `Admin created, but the invite email failed to send. They can use "Forgot password" with ${email} to set one.`,
        );
        setEmail('');
        setFullName('');
        setAddOpen(false);
        router.refresh();
      } finally {
        setSubmitting(false);
      }
    },
    [email, fullName, router],
  );

  const toggleActive = useCallback(
    async (a: Admin) => {
      const verb = a.active ? 'Deactivate' : 'Reactivate';
      if (!confirm(`${verb} ${a.fullName} (${a.email})?`)) return;
      setBusyId(a.id);
      try {
        const res = await fetch(`/api/admin/team/${a.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: !a.active }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(j?.error || `${verb} failed`);
          return;
        }
        router.refresh();
      } finally {
        setBusyId(null);
      }
    },
    [router],
  );

  const deleteAdmin = useCallback(
    async (a: Admin) => {
      if (
        !confirm(
          `Permanently delete ${a.fullName} (${a.email})? This cannot be undone.`,
        )
      )
        return;
      setBusyId(a.id);
      try {
        const res = await fetch(`/api/admin/team/${a.id}`, { method: 'DELETE' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(j?.error || 'Delete failed');
          return;
        }
        router.refresh();
      } finally {
        setBusyId(null);
      }
    },
    [router],
  );

  return (
    <>
      <section className="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="text-sm text-gray-600">
          {admins.length} total · {activeCount} active
        </div>
        <button
          type="button"
          onClick={() => { setAddOpen((v) => !v); setFormError(null); }}
          className="inline-flex h-9 items-center justify-center rounded border border-orange-700 bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-700"
        >
          {addOpen ? 'Cancel' : 'Add admin'}
        </button>
      </section>

      {addedNote && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {addedNote}
        </div>
      )}

      {addOpen && (
        <form
          onSubmit={addAdmin}
          className="mb-6 bg-white border border-gray-200 rounded-lg p-5 space-y-4"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full h-9 rounded border border-gray-300 px-3 text-sm"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-9 rounded border border-gray-300 px-3 text-sm"
                placeholder="jane@myrealtyline.com"
              />
            </div>
          </div>
          {formError && <div className="text-sm text-red-600">{formError}</div>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-9 items-center justify-center rounded border border-orange-700 bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-700 disabled:opacity-60"
            >
              {submitting ? 'Sending invite…' : 'Send invite'}
            </button>
            <span className="text-xs text-gray-500">
              They&apos;ll get an email with a link to set their own password.
            </span>
          </div>
        </form>
      )}

      <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {admins.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No admins yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Last login</th>
                  <th className="text-left px-4 py-3 font-medium">Added</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{a.fullName}</div>
                      {a.isOwner && (
                        <div className="text-xs text-orange-700 font-medium">Owner</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{a.email}</td>
                    <td className="px-4 py-3"><StatusPill active={a.active} /></td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(a.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(a.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {a.isOwner ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <div className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => toggleActive(a)}
                            className="text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-50"
                          >
                            {a.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                          {!a.active && (
                            <button
                              type="button"
                              disabled={busyId === a.id}
                              onClick={() => deleteAdmin(a)}
                              className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
