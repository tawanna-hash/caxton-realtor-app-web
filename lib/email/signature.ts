// lib/email/signature.ts
//
// Doren & Tawanna animated email signature — HTML block appended to
// outgoing marketing emails from the CRM composer.

const GIF_URL = process.env.NEXT_PUBLIC_SIGNATURE_GIF_URL ?? '';

const APP_STORE_URL = 'https://apps.apple.com/app/id6782394889';
const GOOGLE_PLAY_URL = 'https://realtynewsnow.app';
const APP_STORE_BADGE_URL =
  'https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg';
const GOOGLE_PLAY_BADGE_URL =
  'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png';

const FB_ICON = 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@latest/icons/facebook.svg';
const IG_ICON = 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@latest/icons/instagram.svg';
const LI_ICON = 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@latest/icons/linkedin.svg';

export function buildSignatureHtml(): string {
  if (!GIF_URL) return '';
  return `
<!-- BEGIN Doren & Tawanna signature -->
<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;font-family:'Helvetica Neue',Arial,sans-serif;">
  <tr>
    <td>
      <a href="https://realtynewsnow.app" target="_blank" style="text-decoration:none;">
        <img src="${GIF_URL}" width="640" height="380" alt="Doren &amp; Tawanna — Co-publishers of RealtyLine Austin, Newsline SA, Realty News Now App" style="display:block;border:0;outline:none;text-decoration:none;max-width:100%;height:auto;">
      </a>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 40px 0 40px;font-size:12px;color:#6b7280;">
      <a href="https://realtyline.us" target="_blank" style="color:#7c3aed;text-decoration:none;">realtyline.us</a>
      &nbsp;|&nbsp;
      <a href="https://newslinesa.com" target="_blank" style="color:#7c3aed;text-decoration:none;">newslinesa.com</a>
      &nbsp;|&nbsp;
      <a href="https://realtynewsnow.app" target="_blank" style="color:#7c3aed;text-decoration:none;">realtynewsnow.app</a>
    </td>
  </tr>
  <tr>
    <td style="padding:10px 40px 0 40px;">
      <table cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:14px;"><a href="https://www.facebook.com/" target="_blank"><img src="${FB_ICON}" width="20" height="20" alt="Facebook" style="display:block;border:0;"></a></td>
        <td style="padding-right:14px;"><a href="https://www.instagram.com/" target="_blank"><img src="${IG_ICON}" width="20" height="20" alt="Instagram" style="display:block;border:0;"></a></td>
        <td style="padding-right:24px;"><a href="https://www.linkedin.com/" target="_blank"><img src="${LI_ICON}" width="20" height="20" alt="LinkedIn" style="display:block;border:0;"></a></td>
        <td style="padding-right:10px;"><a href="${APP_STORE_URL}" target="_blank"><img src="${APP_STORE_BADGE_URL}" height="40" alt="Download on the App Store" style="display:block;border:0;height:40px;"></a></td>
        <td><a href="${GOOGLE_PLAY_URL}" target="_blank"><img src="${GOOGLE_PLAY_BADGE_URL}" height="40" alt="Get it on Google Play — coming soon" style="display:block;border:0;height:40px;"></a></td>
      </tr></table>
    </td>
  </tr>
</table>
<!-- END Doren & Tawanna signature -->
`.trim();
}

export function appendSignature(body: string, opts?: { skip?: boolean }): string {
  if (opts?.skip) return body;
  const sig = buildSignatureHtml();
  if (!sig) return body;
  return `${body}\n\n${sig}`;
}
