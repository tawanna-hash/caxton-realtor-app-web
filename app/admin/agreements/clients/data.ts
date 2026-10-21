'use client';

import { useEffect, useState } from 'react';

export type Adv = {
  id: number; name: string; publication?: string | null; company: string | null; type: string | null; status: string | null; created_at: string;
  first_name: string | null; last_name: string | null; contact_email: string | null; portal_email: string | null; phone: string | null;
  billing_contact_name: string | null; billing_email: string | null; billing_contact_phone: string | null;
  address: string | null; address_2: string | null; city: string | null; state: string | null; zip: string | null;
  card_last4: string | null; payment_mode: string | null; portal_activated_at: string | null;
  additional_contacts: Array<{ name?: string; email?: string; phone?: string; title?: string }> | null;
};
export type Agr = { id: string; advertiser_id: number | null; status: string; type: string | null; ad_size: string | null; frequency: string | null; start_date: string | null; signed_at?: string | null; created_at?: string | null };
export type Inv = { id: string; number: string | null; advertiser_id?: number | null; agreement_id: string | null; status: string; total_cents: number; balance_cents: number; issue_date: string | null; due_date: string | null };
export type Sch = { id: string; name: string; advertiser_id: number; agreement_id: string | null; status: 'active' | 'paused' | 'ended'; frequency: string; interval_count?: number | null; amount_cents: number; tax_cents: number | null; next_run_at: string; end_date?: string | null; max_occurrences?: number | null; occurrences_generated?: number | null };

export const money = (c: number | null | undefined) => (c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: (c ?? 0) % 100 ? 2 : 0, maximumFractionDigits: 2 })}`);
export const day = (v: string | null | undefined) => (v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export function useJson<T>(url: string, pick: (j: Record<string, unknown>) => T, empty: T): { data: T; loading: boolean; error: string | null } {
  const [state, set] = useState<{ data: T; loading: boolean; error: string | null }>({ data: empty, loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    // Partners edits happen in another tab; reload when this one is focused again.
    const again = () => { if (document.visibilityState === 'visible') setTick((t) => t + 1); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again); };
  }, []);
  useEffect(() => {
    let alive = true;
    fetch(url, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); if (alive) set({ data: pick(j), loading: false, error: null }); })
      .catch((e) => { if (alive) set({ data: empty, loading: false, error: e instanceof Error ? e.message : 'Could not load.' }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick]);
  return state;
}

export type Group = 'active' | 'prospect' | 'archived';
export const groupOf = (status: string | null | undefined): Group => (status === 'prospect' ? 'prospect' : status === 'archived' || status === 'inactive' ? 'archived' : 'active');
export const GROUP_LABEL: Record<Group, string> = { active: 'Active', prospect: 'Prospect', archived: 'Archived' };
export type StatusFilter = Group | 'all';
export const FILTER_LABEL: Record<StatusFilter, string> = { active: 'Active', prospect: 'Prospects', archived: 'Archived', all: 'All' };

export const GROUP_OPTIONS: Array<{ value: Group; label: string }> = [{ value: 'active', label: 'Active' }, { value: 'prospect', label: 'Prospect' }, { value: 'archived', label: 'Archived' }];

// Each market (Austin, San Antonio) keeps its own client record because the
// contacts and billing details differ. The market shows as a chip.
export const MARKET: Record<string, string> = { austin: 'Austin', san_antonio: 'San Antonio', houston: 'Houston', dallas: 'Dallas/FTW' };
export function marketsOf(raw: string | null | undefined): string[] {
  const keys = new Set<string>();
  for (const t of String(raw ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    if (t === 'both') { keys.add('austin'); keys.add('san_antonio'); } else if (MARKET[t]) keys.add(t);
  }
  return [...keys].map((k) => MARKET[k]);
}
export type Client = Adv & { records: Adv[]; markets: string[]; group: Group };
export const mainName = (a: Adv) => [a.first_name, a.last_name].filter(Boolean).join(' ');

export function mergeClients(list: Adv[]): Client[] {
  return list.map((a) => ({
    ...a,
    records: [a],
    markets: marketsOf(a.publication),
    group: groupOf(a.status),
  }));
}
