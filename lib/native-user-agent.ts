// lib/native-user-agent.ts
//
// Server-side detection of the Capacitor native wrapper (iOS WKWebView /
// Android WebView) so the app can skip the public landing page at `/`.
//
// 1. Explicit marker: capacitor.config.ts sets `appendUserAgent`
//    ("RealtyNewsNowApp"); builds that include it are matched exactly.
// 2. Heuristics for installed builds that predate the marker (no rebuild
//    needed): iOS WKWebView omits the Safari/Version tokens that real
//    browsers send, and Android WebView includes "; wv)".
//
// Crawlers and social in-app browsers are explicitly excluded so they keep
// receiving the public landing page.

export const NATIVE_UA_MARKER = 'RealtyNewsNowApp';

const NOT_A_NATIVE_APP =
  /bot|crawl|spider|slurp|facebookexternalhit|FBAN|FBAV|FB_IAB|Instagram|Twitter|LinkedInApp|Line\/|Snapchat|Pinterest|Slackbot|WhatsApp|TikTok|Google-InspectionTool|Lighthouse/i;

export function isNativeAppUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  if (ua.includes(NATIVE_UA_MARKER)) return true;
  if (NOT_A_NATIVE_APP.test(ua)) return false;
  // iOS WKWebView: Apple device, WebKit, but no Safari/Version/CriOS/FxiOS token.
  if (/\b(iPhone|iPad|iPod)\b/.test(ua) && /AppleWebKit/.test(ua)) {
    return !/Safari\/|Version\/|CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  }
  // Android WebView: "; wv)" flag.
  if (/Android/.test(ua) && /;\s*wv\)/.test(ua)) return true;
  return false;
}
