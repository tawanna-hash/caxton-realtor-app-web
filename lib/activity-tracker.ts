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

// Well-known browser-extension and plugin noise. None of these are real app
// errors - they originate from Microsoft Office Smart Lookup, browser
// extensions (LastPass, Grammarly, etc.). Dropping these stops the alert spam.
// NOTE: 'Script error.' is NOT in this list anymore - the unmask logic in
// onError() now captures cross-origin masked errors with context instead of
// silently dropping them.
const NOISE_PATTERNS: RegExp[] = [
  /Object Not Found Matching Id/i,           // MS Office / Edge Smart Lookup
  /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i,
  /Non-Error promise rejection captured/i,
  /Loading chunk \d+ failed/i,                // Stale deploy chunk, harmless
  /ChunkLoadError/i,
  /Failed to fetch dynamically imported module/i,
  /The operation was aborted/i,               // User navigation / fetch abort
  /AbortError/i,
  /NetworkError when attempting to fetch/i,   // User offline
  /Load failed/i,                             // Safari network
  /chrome-extension:\/\//i,                   // Extension errors
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
];

function isNoiseError(message: string, source?: string): boolean {
  const combined = `${message} ${source || ''}`;
  return NOISE_PATTERNS.some((rx) => rx.test(combined));
}

// A 'meaningful' error message has actual diagnostic content. The Jun 20
// flood of '[Realty News Now] Client error: undefined' alerts came from
// promises rejecting with no message: `reason instanceof Error` was true
// but `reason.message` was undefined, which String()-coerced to 'undefined'
// and bypassed the noise filter. Anything that boils down to the literal
// strings below is unactionable garbage — drop the email alert (but still
// send to PostHog for telemetry).
function hasMeaningfulMessage(message: string): boolean {
  const trimmed = String(message ?? '').trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower === 'undefined' || lower === 'null' || lower === 'nan') return false;
  if (lower === '[object object]' || lower === '[object error]') return false;
  if (lower === 'unhandled promise rejection') return false; // fallback string when reason is unknown
  return true;
}

// Collect environment context that's useful even when the actual error
// message is masked by the browser's cross-origin policy. When a script
// loaded without proper CORS headers throws, window.onerror gets called
// with message='Script error.', source/lineno/colno=undefined, errorObj=null.
// In that case at minimum we want to know which page, which route, which
// browser, and what the user was doing.
function buildErrorContext(): string {
  try {
    const parts: string[] = [];
    parts.push(`url=${window.location.href}`);
    if (document.referrer) parts.push(`referrer=${document.referrer}`);
    parts.push(`ua=${navigator.userAgent}`);
    parts.push(`viewport=${window.innerWidth}x${window.innerHeight}`);
    parts.push(`online=${navigator.onLine}`);
    if (document.visibilityState) parts.push(`visibility=${document.visibilityState}`);
    return parts.join(' | ');
  } catch {
    return '';
  }
}

function onError(message: string, source?: string, lineno?: number, colno?: number, errorObj?: unknown): void {
  if (errorBudget.remaining <= 0) return;
  if (isNoiseError(message, source)) return;
  errorBudget.remaining -= 1;

  // Guard against the 'undefined'/'null'/empty alert spam pattern. We still
  // ship to PostHog (telemetry dashboard) but skip the inbox alert so
  // Tawanna's mailbox doesn't drown in non-actionable noise.
  const skipEmailAlert = !hasMeaningfulMessage(message);

  // 'Script error.' with no source/lineno is the well-known cross-origin
  // masking pattern. Tag it explicitly so the alert email is honest about
  // what we know vs. what the browser hid.
  const isMasked =
    String(message) === 'Script error.' &&
    !source &&
    lineno === undefined &&
    !errorObj;

  const ctx = buildErrorContext();
  const stack = errorObj instanceof Error ? errorObj.stack : null;
  const detailParts: string[] = [];
  if (isMasked) {
    detailParts.push(
      '[BROWSER-MASKED: error came from a cross-origin script without CORS headers — actual message and stack hidden by the browser. The context below is what we can still see.]',
    );
  }
  if (source) detailParts.push(`${source}:${lineno}:${colno}`);
  if (stack) detailParts.push(stack);
  if (ctx) detailParts.push(ctx);
  const detail = detailParts.join('\n');

  captureToPostHog('client_error', {
    $exception_message: message,
    $exception_source: source,
    $exception_lineno: lineno,
    $exception_colno: colno,
    $exception_stack: errorObj instanceof Error ? errorObj.stack : undefined,
    masked_by_browser: isMasked,
    skipped_email_alert: skipEmailAlert,
    page_url: typeof window !== 'undefined' ? window.location.href : undefined,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  });
  if (skipEmailAlert) return; // telemetry-only; don't email garbage 'undefined' errors
  sendAlert({
    kind: 'client_error',
    title: isMasked
      ? `Script error (masked) on ${window.location.pathname}`
      : String(message).slice(0, 180),
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
  }, true); // capture phase so we see errors before any swallowing handler runs
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    // Be defensive: an Error with no .message string-coerces to 'undefined'
    // which used to bypass the noise filter. Fall back to constructor name
    // (e.g. 'TypeError') when message is empty so the alert is at least
    // identifiable, and let hasMeaningfulMessage() in onError() drop totally
    // empty cases from the inbox alert path (still goes to PostHog).
    let message: string;
    if (reason instanceof Error) {
      message = (reason.message && String(reason.message).trim())
        || reason.name
        || 'Error';
    } else if (typeof reason === 'string' && reason.trim()) {
      message = reason;
    } else if (reason && typeof reason === 'object') {
      try { message = JSON.stringify(reason).slice(0, 200); } catch { message = 'Unhandled promise rejection'; }
    } else {
      message = 'Unhandled promise rejection';
    }
    onError(message, undefined, undefined, undefined, reason instanceof Error ? reason : undefined);
  });

  // Delegated capture so we hear every form submit, even from forms added
  // after page load. capture:true so we run before React handlers can
  // preventDefault and abort.
  document.addEventListener('submit', (e) => onFormSubmit(e as SubmitEvent), true);
}
