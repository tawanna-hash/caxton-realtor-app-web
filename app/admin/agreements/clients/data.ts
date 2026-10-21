'use client';

import { useEffect, useState } from 'react';

export type Adv = {
  id: number; name: string; company: string | null; type: string | null; status: string | null; created_at: string;
  first_name: string | null; last_name: string | null; contact_email: string | null; portal_email: string | null; phone: string | null;
  billing_contact_name: string | null; billing_email: string | null; billing_contact_phone: string | null;
  address: string | null; address_2: string | null; city: string | null; state: string | null; zip: string | null;
  card_last4: string | null; payment_mode: string | null; portal_activated_at: string | null;
  additional_contacts: Array<{ name?: string; email?: string; phone?: string; title?: string }> | null;
};
export type Agr = { id: string; advertiser_id: number | null; status: string; type: string | null; ad_size: string | null; frequency: string | null; start_date: string | null; signed_at?: string | null; created_at?: string | null };
export type Inv = { id: string; number: string | null; advertiser_id?: number | null; agreement_id: string | null; status: string; total_cents: number; balance_cents: number; issue_date: string | null; due_date: string | null };
export type Sch = { id: string; name: string; advertiser_id: number; agreement_id: string | null; status: 'active' | 'paused' | 'ended'; frequency: string; amount_cents: number; tax_cents: number | null; next_run_at: string };

export const money = (c: number | null | undefined) => (c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);
export const day = (v: string | null | undefined) => (v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export function useJson<T>(url: string, pick: (j: Record<string, unknown>) => T, empty: T): { data: T; loading: boolean; error: string | null } {
  const [state, set] = useState<{ data: T; loading: boolean; error: string | null }>({ data: empty, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    fetch(url, { credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); if (alive) set({ data: pick(j), loading: false, error: null }); })
      .catch((e) => { if (alive) set({ data: empty, loading: false, error: e instanceof Error ? e.message : 'Could not load.' }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return state;
}
