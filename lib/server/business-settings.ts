import { getSql } from '@/lib/db';

export type BusinessDetails = {
  name: string; description: string; address: string; address2: string; city: string; state: string; postal: string;
  logo: string; colors: string[];
  group_identical_services: boolean; show_service_description: boolean; show_service_period: boolean; invoice_prefix: string;
};
export const DEFAULT_BUSINESS: BusinessDetails = {
  name: 'Realty News Now', description: 'Newspaper Publishing', address: '', address2: '', city: 'Austin', state: 'TX', postal: '',
  logo: '', colors: ['#582BE7', '#E8EDFB', '#F3F4F7'],
  group_identical_services: false, show_service_description: false, show_service_period: false, invoice_prefix: 'RLM',
};

let ensured = false;
export async function ensureBusinessTables() {
  if (ensured) return;
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS business_settings (id integer PRIMARY KEY DEFAULT 1, data jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text)`;
  await sql`CREATE TABLE IF NOT EXISTS admin_api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, key_prefix text NOT NULL, key_hash text NOT NULL UNIQUE,
    created_by text, created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz, revoked_at timestamptz)`;
  ensured = true;
}

export async function loadBusinessDetails(): Promise<BusinessDetails> {
  await ensureBusinessTables();
  const rows = (await getSql()`SELECT data FROM business_settings WHERE id = 1`) as unknown as Array<{ data: Partial<BusinessDetails> }>;
  return { ...DEFAULT_BUSINESS, ...(rows[0]?.data ?? {}) };
}
