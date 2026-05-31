// lib/types/renewal-reminder.ts

export type RenewalReminderStatus = 'Pending' | 'Completed' | 'Dismissed';

export interface RenewalReminder {
  id: string;
  agreement_id: string;
  company_name: string | null;
  rep_name: string | null;
  email: string | null;
  ad_size: string | null;
  frequency: string | null;
  ad_rate_cents: number | null;
  exp_date: string | null;          // ISO date YYYY-MM-DD
  remind_date: string | null;       // ISO date YYYY-MM-DD
  status: RenewalReminderStatus;
  note: string | null;
  triggered_by: string | null;
  created_at: string;               // ISO timestamp
}
