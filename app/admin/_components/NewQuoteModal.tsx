'use client';

/**
 * NewQuoteModal — standalone quote builder.
 *
 * Mounts from two entry points:
 *   - /admin/ads/inquiries (top-right "+ New quote")
 *   - /admin/agreements    (next to "+ New agreement")
 *
 * Flow:
 *   1. Search existing advertisers (client-side filter over GET
 *      /api/admin/advertisers), or toggle "Create new"
 *   2. Pick channel + package + pricing options
 *   3. Submit → POST /api/admin/quotes → shows success card with
 *      agreement number + Send Quote button (calls existing
 *      /api/admin/agreements/[id]/send)
 *
 * No new schemas — same drafter as the inquiry-quote flow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PACKAGES, EBLASTS, eblastPriceForPub } from '@/lib/media-kit';

function eblastId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

type Publication = 'austin' | 'san_antonio' | 'both';
type Channel = 'print' | 'email';

interface AdvertiserRow {
  id: number;
  name: string;
  contact_email: string | null;
  publication: string;
}

interface CreatedAgreement {
  id: string;
  status: string;
  type: string | null;
  amount_cents: number;
}
interface CreatedInvoice {
  id: string;
  number: string | null;
  amount_cents: number;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional callback after a successful draft (e.g. to refresh a list). */
  onDrafted?: () => void;
}

export default function NewQuoteModal({ open, onClose, onDrafted }: Props) {
  // ── Advertiser picker state ───────────────────────────────────────
  const [advertisers, setAdvertisers] = useState<AdvertiserRow[]>([]);
  const [advertiserSearch, setAdvertiserSearch] = useState('');
  const [selectedAdvertiserId, setSelectedAdvertiserId] = useState<number | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newPublication, setNewPublication] = useState<Publication>('austin');

  // ── Quote form state ──────────────────────────────────────────────
  const [channel, setChannel] = useState<Channel>('print');
  const [packageId, setPackageId] = useState<string>(PACKAGES[0]?.id ?? '');
  const [size, setSize] = useState<string>('');
  const [months, setMonths] = useState<number>(1);
  const [sends, setSends] = useState<number>(1);
  const [publication, setPublication] = useState<Publication>('austin');
  const [dueDate, setDueDate] = useState<string>('');
  const [memo, setMemo] = useState<string>('');

  // ── Submit state ──────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAgreement, setCreatedAgreement] = useState<CreatedAgreement | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<CreatedInvoice | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Fetch advertisers list on first open. Client-side filter after that.
  useEffect(() => {
    if (!open || advertisers.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/advertisers', { credentials: 'include' });
        if (!res.ok) return;
        const json = (await res.json()) as { advertisers: AdvertiserRow[] };
        if (!cancelled) setAdvertisers(json.advertisers ?? []);
      } catch {
        // silent — list stays empty, user can still Create new
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, advertisers.length]);

  // Imperative reset — called by Close/Cancel handlers so we don't need
  // a state-mutating effect for what is really user-driven cleanup.
  const resetAll = useCallback(() => {
    setAdvertiserSearch('');
    setSelectedAdvertiserId(null);
    setCreateNew(false);
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setNewPublication('austin');
    setChannel('print');
    setPackageId(PACKAGES[0]?.id ?? '');
    setSize(PACKAGES[0]?.sizes[0]?.size ?? '');
    setMonths(1);
    setSends(1);
    setPublication('austin');
    setDueDate('');
    setMemo('');
    setError(null);
    setCreatedAgreement(null);
    setCreatedInvoice(null);
    setSent(false);
  }, []);

  const handleClose = useCallback(() => {
    resetAll();
    onClose();
  }, [resetAll, onClose]);

  const filteredAdvertisers = useMemo(() => {
    const q = advertiserSearch.trim().toLowerCase();
    if (!q) return advertisers.slice(0, 20);
    return advertisers
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.contact_email ?? '').toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [advertisers, advertiserSearch]);

  const selectedAdvertiser = useMemo(
    () => advertisers.find((a) => a.id === selectedAdvertiserId) ?? null,
    [advertisers, selectedAdvertiserId],
  );

  const selectedPrintPackage = useMemo(
    () => (channel === 'print' ? PACKAGES.find((p) => p.id === packageId) ?? null : null),
    [channel, packageId],
  );
  const selectedEmailPackage = useMemo(
    () =>
      channel === 'email' ? EBLASTS.find((e) => eblastId(e.name) === packageId) ?? null : null,
    [channel, packageId],
  );

  // Channel + package changes reset dependent fields imperatively via the
  // onChange handlers below — no effects, no cascading renders.
  const handleChannelChange = useCallback((next: Channel) => {
    setChannel(next);
    if (next === 'print') {
      const firstPkg = PACKAGES[0];
      setPackageId(firstPkg?.id ?? '');
      setSize(firstPkg?.sizes[0]?.size ?? '');
    } else {
      const firstEb = EBLASTS[0];
      setPackageId(firstEb ? eblastId(firstEb.name) : '');
      setSize('');
    }
  }, []);

  const handlePackageChange = useCallback(
    (nextId: string) => {
      setPackageId(nextId);
      if (channel === 'print') {
        const pkg = PACKAGES.find((p) => p.id === nextId);
        setSize(pkg?.sizes[0]?.size ?? '');
      }
    },
    [channel],
  );

  // Price preview.
  const previewCents = useMemo(() => {
    if (channel === 'print' && selectedPrintPackage) {
      const s = selectedPrintPackage.sizes.find((sz) => sz.size === size);
      if (!s) return 0;
      return s.price * 100 * months;
    }
    if (channel === 'email' && selectedEmailPackage) {
      const mkPub =
        publication === 'austin' ? 'realtyline' :
        publication === 'san_antonio' ? 'newsline' :
        'both';
      return Math.round(eblastPriceForPub(selectedEmailPackage, mkPub) * 100) * sends;
    }
    return 0;
  }, [channel, selectedPrintPackage, selectedEmailPackage, size, months, sends, publication]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (createNew) {
      if (!newName.trim() || !newEmail.trim()) return false;
    } else {
      if (!selectedAdvertiserId) return false;
    }
    if (!packageId) return false;
    if (previewCents <= 0) return false;
    return true;
  }, [submitting, createNew, newName, newEmail, selectedAdvertiserId, packageId, previewCents]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const advertiserPayload = createNew
        ? {
            name: newName.trim(),
            contact_email: newEmail.trim(),
            publication: newPublication,
            ...(newPhone.trim() ? { phone: newPhone.trim() } : {}),
          }
        : { id: selectedAdvertiserId! };

      const payload: Record<string, unknown> = {
        channel,
        package_id: packageId,
        advertiser: advertiserPayload,
      };
      if (channel === 'print') {
        payload.size = size;
        payload.months = months;
      } else {
        payload.sends = sends;
        payload.publication = publication;
      }
      if (dueDate) payload.due_date = dueDate;
      if (memo.trim()) payload.memo = memo.trim();

      const res = await fetch('/api/admin/quotes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `Quote failed (${res.status})`);
      }
      const json = (await res.json()) as {
        agreement: CreatedAgreement;
        invoice: CreatedInvoice;
      };
      setCreatedAgreement(json.agreement);
      setCreatedInvoice(json.invoice);
      onDrafted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quote failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSend() {
    if (!createdAgreement) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/agreements/${createdAgreement.id}/send`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `Send failed (${res.status})`);
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  // ── Render success card ────────────────────────────────────────────
  if (createdAgreement && createdInvoice) {
    const paymentTerms =
      channel === 'email'
        ? 'Payment due immediately on invoice.'
        : 'Print: invoiced monthly, net-20 (card or check).';
    return (
      <ModalShell onClose={handleClose} title="Quote drafted">
        <div className="border border-green-200 bg-green-50 rounded-md p-4">
          <p className="text-sm font-semibold text-green-900">
            {createdInvoice.number ?? createdInvoice.id}
            <span className="ml-2 text-xs font-normal text-green-800">
              · agreement {createdAgreement.id.slice(0, 8)}
            </span>
          </p>
          <p className="text-xs text-green-900 mt-1">
            ${(createdInvoice.amount_cents / 100).toFixed(2)} · status {createdInvoice.status}.
          </p>
          <p className="text-xs text-green-800 mt-1 italic">{paymentTerms}</p>
          {sent && (
            <p className="text-xs text-green-900 mt-2 font-medium">
              ✓ Quote email sent — client will receive a sign link.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!sent && (
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Send Quote to Client'}
              </button>
            )}
            <a
              href={`/admin/agreements?id=${encodeURIComponent(createdAgreement.id)}`}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-green-300 bg-white text-green-900 hover:bg-green-100"
            >
              Open agreement
            </a>
            <a
              href={`/admin/invoices?focus=${encodeURIComponent(createdInvoice.id)}`}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-green-300 bg-white text-green-900 hover:bg-green-100"
            >
              Open in Invoices
            </a>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            >
              Close
            </button>
          </div>
          {error && <p className="text-xs text-red-700 mt-2">Error: {error}</p>}
        </div>
      </ModalShell>
    );
  }

  // ── Render form ────────────────────────────────────────────────────
  return (
    <ModalShell onClose={handleClose} title="New quote">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Advertiser picker */}
        <section className="border border-gray-200 rounded-md p-3 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs uppercase tracking-wider text-gray-600 font-semibold">
              Advertiser
            </p>
            <button
              type="button"
              onClick={() => {
                setCreateNew((v) => !v);
                setSelectedAdvertiserId(null);
              }}
              className="text-xs text-purple-700 hover:underline"
            >
              {createNew ? '← Search existing' : '+ Create new advertiser'}
            </button>
          </div>

          {!createNew && (
            <>
              <input
                type="text"
                value={advertiserSearch}
                onChange={(e) => setAdvertiserSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <div className="mt-2 max-h-48 overflow-auto border border-gray-200 rounded-md bg-white">
                {filteredAdvertisers.length === 0 ? (
                  <p className="text-xs text-gray-500 p-3">
                    No matches. Use “+ Create new advertiser” above.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {filteredAdvertisers.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedAdvertiserId(a.id)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                            selectedAdvertiserId === a.id ? 'bg-purple-50' : ''
                          }`}
                        >
                          <span className="font-medium text-gray-900">{a.name}</span>
                          {a.contact_email && (
                            <span className="ml-2 text-xs text-gray-600">
                              {a.contact_email}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {selectedAdvertiser && (
                <p className="mt-2 text-xs text-green-800">
                  Selected: <span className="font-medium">{selectedAdvertiser.name}</span>
                </p>
              )}
            </>
          )}

          {createNew && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-xs text-gray-700">
                Name
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                  required
                />
              </label>
              <label className="text-xs text-gray-700">
                Contact email
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                  required
                />
              </label>
              <label className="text-xs text-gray-700">
                Phone (optional)
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
              </label>
              <label className="text-xs text-gray-700">
                Home publication
                <select
                  value={newPublication}
                  onChange={(e) => setNewPublication(e.target.value as Publication)}
                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                >
                  <option value="austin">RealtyLine (Austin)</option>
                  <option value="san_antonio">Newsline (San Antonio)</option>
                  <option value="both">Both</option>
                </select>
              </label>
            </div>
          )}
        </section>

        {/* Channel + package */}
        <section className="border border-gray-200 rounded-md p-3">
          <p className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-2">
            Package
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-xs text-gray-700">
              Channel
              <select
                value={channel}
                onChange={(e) => handleChannelChange(e.target.value as Channel)}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
              >
                <option value="print">Print</option>
                <option value="email">E-Blast</option>
              </select>
            </label>
            <label className="text-xs text-gray-700">
              {channel === 'print' ? 'Print package' : 'E-Blast package'}
              <select
                value={packageId}
                onChange={(e) => handlePackageChange(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
              >
                {channel === 'print'
                  ? PACKAGES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))
                  : EBLASTS.map((e) => (
                      <option key={eblastId(e.name)} value={eblastId(e.name)}>
                        {e.name}
                      </option>
                    ))}
              </select>
            </label>

            {channel === 'print' && selectedPrintPackage && (
              <>
                <label className="text-xs text-gray-700">
                  Size
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                  >
                    {selectedPrintPackage.sizes.map((s) => (
                      <option key={s.size} value={s.size}>
                        {s.size} — ${s.price} ({s.dim})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-700">
                  Months
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={months}
                    onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                  />
                </label>
              </>
            )}

            {channel === 'email' && (
              <>
                <label className="text-xs text-gray-700">
                  Sends
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={sends}
                    onChange={(e) => setSends(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                  />
                </label>
                <label className="text-xs text-gray-700">
                  Publication scope
                  <select
                    value={publication}
                    onChange={(e) => setPublication(e.target.value as Publication)}
                    className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                  >
                    <option value="austin">RealtyLine (Austin)</option>
                    <option value="san_antonio">Newsline (San Antonio)</option>
                    <option value="both">Both</option>
                  </select>
                </label>
              </>
            )}
          </div>
        </section>

        {/* Memo + due date */}
        <section className="border border-gray-200 rounded-md p-3">
          <p className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-2">
            Options
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-xs text-gray-700">
              Due date (optional)
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </label>
            <label className="text-xs text-gray-700 sm:col-span-1">
              Memo (optional)
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Appears on invoice"
                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
            </label>
          </div>
        </section>

        {/* Preview */}
        <div className="flex items-center justify-between px-3 py-2 rounded-md bg-purple-50 border border-purple-100">
          <span className="text-xs text-purple-900">Preview total</span>
          <span className="text-sm font-semibold text-purple-900">
            ${(previewCents / 100).toFixed(2)}
          </span>
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 rounded-md text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Drafting…' : 'Draft quote'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Small modal shell (no shared modal primitive imported to keep this
// file drop-in-safe across both entry points).
function ModalShell({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

