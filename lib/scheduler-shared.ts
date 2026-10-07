/**
 * Closing Time Schedulers: shared types, defaults, time-zone math and slot generation.
 * Used by the agent's setup wizard (browser), the public booking page and the server.
 */

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const DAYS: { key: DayKey; label: string; long: string }[] = [
  { key: 'mon', label: 'Mon', long: 'Monday' }, { key: 'tue', label: 'Tue', long: 'Tuesday' }, { key: 'wed', label: 'Wed', long: 'Wednesday' },
  { key: 'thu', label: 'Thu', long: 'Thursday' }, { key: 'fri', label: 'Fri', long: 'Friday' }, { key: 'sat', label: 'Sat', long: 'Saturday' }, { key: 'sun', label: 'Sun', long: 'Sunday' },
];

export type Question = { id: string; label: string; type: 'text' | 'textarea' | 'phone'; required: boolean };
export type Reminder = { amount: number; unit: 'minutes' | 'hours' | 'days' };
export type MeetingKind = 'none' | 'google_meet' | 'teams' | 'custom';

export type SchedulerConfig = {
  // 1. Select Calendars
  bookingCalendar: string; // 'closing_time' or a connected calendar id
  bookingCalendarName: string;
  additionalCalendars: { id: string; name: string }[];
  name: string;
  yourName: string;
  urlMode: 'alias' | 'root';
  alias: string;
  // 2. Availability
  lengths: number[];
  defaultLength: number;
  hours: Record<DayKey, { on: boolean; start: string; end: string }>;
  timezone: string;
  windowDays: number;
  noticeMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  incrementMin: number; // 0 = default (meeting length)
  // 3. Event Details
  subject: string;
  description: string;
  color: string; // '' = calendar default, otherwise a Google colorId 1-11
  meeting: MeetingKind;
  meetingLink: string;
  attendees: string;
  questions: Question[];
  // 4. Appearance And Branding
  welcome: string;
  redirectUrl: string;
  language: 'en' | 'es';
  bookerLocale: 'auto' | 'en' | 'es';
  timeFormat: '12h' | '24h';
  weekStart: 'sunday' | 'monday';
  hasBanner: boolean;
  hasAvatar: boolean;
  // 5. Workflow
  reminders: (Reminder & { subject: string; message: string })[];
  followUp: (Reminder & { subject: string; message: string }) | null;
  // 6. Payments
  payment: { on: boolean; amount: string; label: string; link: string };
};

const nineToFive = { on: true, start: '09:00', end: '17:00' };
export function defaultConfig(yourName = ''): SchedulerConfig {
  return {
    bookingCalendar: '', bookingCalendarName: '', additionalCalendars: [], name: '', yourName, urlMode: 'alias', alias: '',
    lengths: [60, 30, 15], defaultLength: 60,
    hours: { mon: { ...nineToFive }, tue: { ...nineToFive }, wed: { ...nineToFive }, thu: { ...nineToFive }, fri: { ...nineToFive }, sat: { ...nineToFive, on: false }, sun: { ...nineToFive, on: false } },
    timezone: 'America/Chicago', windowDays: 30, noticeMin: 0, bufferBeforeMin: 0, bufferAfterMin: 0, incrementMin: 0,
    subject: '{invitee_name} and {my_name} - {subject}', description: '', color: '', meeting: 'none', meetingLink: '', attendees: '', questions: [],
    welcome: '', redirectUrl: '', language: 'en', bookerLocale: 'auto', timeFormat: '12h', weekStart: 'sunday', hasBanner: false, hasAvatar: false,
    reminders: [], followUp: null,
    payment: { on: false, amount: '', label: '', link: '' },
  };
}

export const TIMEZONES = [
  'America/Chicago', 'America/New_York', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Mexico_City', 'America/Bogota', 'Europe/London', 'Europe/Madrid', 'UTC',
];
export const WINDOWS: { days: number; label: string }[] = [
  { days: 7, label: '1 week' }, { days: 14, label: '2 weeks' }, { days: 30, label: '1 month' }, { days: 60, label: '2 months' }, { days: 90, label: '3 months' }, { days: 180, label: '6 months' },
];
export const NOTICES = [0, 15, 30, 60, 120, 240, 720, 1440, 2880];
export const BUFFERS = [0, 5, 10, 15, 30, 45, 60];
export const INCREMENTS = [0, 5, 10, 15, 20, 30, 60];
export const GOOGLE_COLORS: { id: string; hex: string; name: string }[] = [
  { id: '1', hex: '#7986CB', name: 'Lavender' }, { id: '2', hex: '#33B679', name: 'Sage' }, { id: '3', hex: '#8E24AA', name: 'Grape' }, { id: '4', hex: '#E67C73', name: 'Flamingo' },
  { id: '5', hex: '#F6BF26', name: 'Banana' }, { id: '6', hex: '#F4511E', name: 'Tangerine' }, { id: '7', hex: '#039BE5', name: 'Peacock' }, { id: '8', hex: '#616161', name: 'Graphite' },
  { id: '9', hex: '#3F51B5', name: 'Blueberry' }, { id: '10', hex: '#0B8043', name: 'Basil' }, { id: '11', hex: '#D50000', name: 'Tomato' },
];

export function minutesLabel(m: number): string {
  if (m === 0) return '0 minutes';
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? '' : 's'}`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? '' : 's'}`;
  return `${m} minutes`;
}
export const windowLabel = (d: number) => WINDOWS.find((w) => w.days === d)?.label ?? `${d} days`;

export function tzLabel(tz: string, at = new Date()): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? '';
    return `${tz} (${name === 'GMT' ? 'GMT+0:00' : name.replace(/^GMT([+-]\d+)$/, 'GMT$1:00')})`;
  } catch { return tz; }
}

export function timeLabel(hhmm: string, format: '12h' | '24h'): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (format === '24h') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Wall-clock parts of an instant in a time zone. */
export function zoned(at: Date, tz: string): { date: string; time: string; weekday: DayKey } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(at);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}`, weekday: g('weekday').toLowerCase().slice(0, 3) as DayKey };
}

/** Converts a wall-clock date and time in a time zone to a UTC instant (handles daylight saving). */
export function wallToUtc(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const z = zoned(new Date(guess), tz);
  const [zy, zmo, zd] = z.date.split('-').map(Number);
  const [zh, zmi] = z.time.split(':').map(Number);
  const asZone = Date.UTC(zy, zmo - 1, zd, zh, zmi);
  const first = guess + (guess - asZone);
  // Second pass settles times right at a daylight-saving change.
  const z2 = zoned(new Date(first), tz);
  const [y2, mo2, d2] = z2.date.split('-').map(Number);
  const [h2, mi2] = z2.time.split(':').map(Number);
  return new Date(first + (Date.UTC(y, mo - 1, d, h, mi) - Date.UTC(y2, mo2 - 1, d2, h2, mi2)));
}

export const addDays = (date: string, n: number) => { const t = new Date(`${date}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export type Busy = { start: number; end: number };

/** Open start times (UTC ms) for a date range, honoring weekly hours, notice, window, buffers and busy time. */
export function openSlots(cfg: SchedulerConfig, length: number, fromDate: string, toDate: string, busy: Busy[], now = Date.now()): Record<string, { start: number; time: string }[]> {
  const out: Record<string, { start: number; time: string }[]> = {};
  const step = cfg.incrementMin || length;
  const earliest = now + cfg.noticeMin * 60_000;
  const today = zoned(new Date(now), cfg.timezone).date;
  const last = addDays(today, cfg.windowDays);
  for (let d = fromDate; d <= toDate && d <= last; d = addDays(d, 1)) {
    if (d < today) continue;
    const wd = DAYS[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7].key;
    const h = cfg.hours[wd];
    if (!h?.on) continue;
    const s = toMin(h.start), e = toMin(h.end);
    for (let m = s; m + length <= e; m += step) {
      const start = wallToUtc(d, fromMin(m), cfg.timezone).getTime();
      if (start < earliest) continue;
      const lo = start - cfg.bufferBeforeMin * 60_000, hi = start + (length + cfg.bufferAfterMin) * 60_000;
      if (busy.some((b) => b.start < hi && b.end > lo)) continue;
      (out[d] ??= []).push({ start, time: fromMin(m) });
    }
  }
  return out;
}

export function fillTemplate(t: string, v: { invitee_name: string; invitee_email: string; my_name: string; subject: string }): string {
  return t.replace(/\{(invitee_name|invitee_email|my_name|subject)\}/g, (_m, k: keyof typeof v) => v[k] ?? '').replace(/\s+-\s*$/, '').trim();
}

export function slugify(v: string): string {
  return v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 60);
}
export function aliasify(v: string): string {
  return v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/* ---------- Booking page text in English and Spanish ---------- */
export const T = {
  en: {
    welcome: 'Welcome! Please pick a time below.', selectDate: 'Select a date', selectTime: 'Select a time', noTimes: 'No open times on this day.', noDates: 'No open times in this range. Try the next month.',
    duration: 'Duration', back: 'Back', details: 'Enter your details', name: 'Your name', email: 'Email', confirm: 'Confirm Booking', booking: 'Booking',
    booked: 'You are booked', sentTo: 'A confirmation was sent to', addCal: 'Add To Calendar', pay: 'Pay Now', required: 'Required', timesIn: 'Times shown in',
    cancel: 'Cancel Booking', cancelled: 'This booking was cancelled.', min: 'min', with: 'with', notLive: 'This booking page is not live yet.', choose: 'Choose a meeting', where: 'Where', guests: 'Guests',
  },
  es: {
    welcome: '¡Bienvenido! Elija una hora a continuación.', selectDate: 'Elija una fecha', selectTime: 'Elija una hora', noTimes: 'No hay horarios disponibles este día.', noDates: 'No hay horarios disponibles. Pruebe el próximo mes.',
    duration: 'Duración', back: 'Atrás', details: 'Ingrese sus datos', name: 'Su nombre', email: 'Correo electrónico', confirm: 'Confirmar Cita', booking: 'Reservando',
    booked: 'Su cita está confirmada', sentTo: 'Se envió una confirmación a', addCal: 'Agregar Al Calendario', pay: 'Pagar Ahora', required: 'Obligatorio', timesIn: 'Horarios en',
    cancel: 'Cancelar Cita', cancelled: 'Esta cita fue cancelada.', min: 'min', with: 'con', notLive: 'Esta página de citas aún no está activa.', choose: 'Elija una reunión', where: 'Dónde', guests: 'Invitados',
  },
} as const;
export type Lang = keyof typeof T;
