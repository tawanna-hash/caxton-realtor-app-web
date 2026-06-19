// lib/activity-tracker.ts
//
// Client-side tracker for the launch-week activity dashboard. Runs in the
// browser only, alongside PostHog. Two responsibilities:
//
// 1. Global error capture -- window.onerror + unhandledrejection. Sends
//    'client_error' to PostHog (so the dashboard sees it) AND fires an
//    email alert via /api/activity/alert.
//
// 2. Global form-submit capture -- delegated listener on document. Fires
//    'form_submitted' to PostHog and an email alert with form name +
//    visible label.
//
// Both kinds are throttled per-page-load to avoid floods: max 3 errors
// per page load, max 5 form submits per page load.

import posthog from 'posthog-js';

let installed = false;

const errorBudget = { remaining: 3 };
const formBudget = { remaining: 5 };

interface AlertPayload {
  kind: 'form_submit' | 'client_error';
  title: string;
  detail?: string;
  path?: string;
  url?: string;
  publication?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

function activePublication(): string | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    if (window.location.hostname.endsWith('realtynewsnow.app')) return 'realtynewsnow';
    const saved = window.localStorage.getItem('caxton_pub');
    if (saved === 'realtyline' || saved === 'newsline') return saved;
  } catch { /* ignore */ }
  return undefined;
}

function sendAlert(payload: AlertPayload): void {
  try {
    const body = JSON.stringify({
      ...payload,
      publication: payload.publication ?? activePublication(),
      path: payload.path ?? window.location.pathname,
      url: payload.url ?? window.location.href,
    });
    // sendBeacon survives navigation; falls back to fetch when unavailable.
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon && navigator.sendBeacon('/api/activity/alert', blob)) return;
    void fetch('/api/activity/alert', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* swallow */ });
  } catch { /* swallow */ }
}

function captureToPostHog(event: string, props: Record<string, unknown>): void {
  try { posthog.capture(event, props); } catch { /* swallow */ }
}

function onError(message: string, source?: string, lineno?: number, colno?: number, errorObj?: unknown): void {
  if (errorBudget.remaining <= 0) return;
  errorBudget.remaining -= 1;
  const detail = [source && `${source}:${lineno}:${colno}`, errorObj instanceof Error ? errorObj.stack : null]
    .filter(Boolean)
    .join('\n');
  captureToPostHog('client_error', {
    $exception_message: message,
    $exception_source: source,
    $exception_lineno: lineno,
    $exception_colno: colno,
    $exception_stack: errorObj instanceof Error ? errorObj.stack : undefined,
  });
  sendAlert({
    kind: 'client_error',
    title: String(message).slice(0, 180),
    detail: detail.slice(0, 1800) || undefined,
  });
}

function visibleLabel(form: HTMLFormElement): string {
  // Best-effort name: explicit name attr -> aria-label -> first submit button
  // text -> first heading -> 'form'.
  if (form.name) return form.name;
  const aria = form.getAttribute('aria-label');
  if (aria) return aria;
  const submit = form.querySelector<HTMLButtonElement | HTMLInputElement>(
    'button[type=submit], input[type=submit], button:not([type])',
  );
  if (submit) {
    const txt = (submit instanceof HTMLInputElement ? submit.value : submit.textContent ?? '').trim();
    if (txt) return txt;
  }
  const heading = form.querySelector('h1,h2,h3,h4,h5,h6,legend');
  if (heading?.textContent) return heading.textContent.trim();
  return 'form';
}

function onFormSubmit(e: SubmitEvent): void {
  if (formBudget.remaining <= 0) return;
  formBudget.remaining -= 1;
  const form = e.target instanceof HTMLFormElement ? e.target : null;
  if (!form) return;
  // Skip admin forms; the dashboard is public-app focused.
  if (window.location.pathname.startsWith('/admin')) return;

  const name = visibleLabel(form);
  // Try to pull a user-typed email if any input[type=email] is filled.
  let email: string | undefined;
  try {
    const emailInput = form.querySelector<HTMLInputElement>('input[type=email]');
    if (emailInput?.value && /\S+@\S+\.\S+/.test(emailInput.value)) email = emailInput.value;
  } catch { /* ignore */ }

  const methodUpper = (form.method || 'GET').toUpperCase();
  captureToPostHog('form_submitted', {
    form_name: name,
    form_action: form.action || undefined,
    form_method: methodUpper,
  });

  // GET forms are search/filter widgets (magazine search, directory filter,
  // etc.) — they reload the page with a query string and aren't real lead
  // submissions. Keep them in the PostHog dashboard for traffic visibility,
  // but don't email Tawanna. Only POST/PUT/PATCH/DELETE submissions fire the
  // inbox alert (newsletter signup, advertiser request, giveaway entry, etc.).
  if (methodUpper === 'GET') return;

  sendAlert({
    kind: 'form_submit',
    title: name.slice(0, 180),
    detail: `Action: ${form.action || '(same page)'} · Method: ${methodUpper}`,
    email,
    metadata: { form_action: form.action || null, form_method: methodUpper },
  });
}

export function installActivityTracker(): void {
  if (installed) return;
  if (typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (e) => {
    onError(e.message, e.filename, e.lineno, e.colno, e.error);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const message = reason instanceof Error
      ? reason.message
      : typeof reason === 'string' ? reason : 'Unhandled promise rejection';
    onError(message, undefined, undefined, undefined, reason instanceof Error ? reason : undefined);
  });

  // Delegated capture so we hear every form submit, even from forms added
  // after page load. capture:true so we run before React handlers can
  // preventDefault and abort.
  document.addEventListener('submit', (e) => onFormSubmit(e as SubmitEvent), true);
}
