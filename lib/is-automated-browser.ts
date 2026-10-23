// Detects headless / automated browsers (monitors, crawlers, test runners).
// Used to keep bot traffic out of the inbox alerts and to skip DOM-mutating
// helpers (like AutoOpenSections) that can race React in those environments.
const BOT_UA = /HeadlessChrome|PhantomJS|Lighthouse|Playwright|Puppeteer|Selenium|bot\b|crawler|spider|Googlebot|bingbot|Pingdom|Uptime/i;

export function isAutomatedBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  try {
    if (navigator.webdriver) return true;
    return BOT_UA.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}

// React reconciliation failures caused by something else changing the DOM
// under React (extensions, translators, injected scripts, bots).
export function isDomReconcileError(message: string): boolean {
  const m = String(message ?? '');
  return /NotFoundError/i.test(m) && /'(removeChild|insertBefore)' on 'Node'/i.test(m)
    || /Failed to execute '(removeChild|insertBefore)' on 'Node'/i.test(m);
}
