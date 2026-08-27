// lib/email/signature.ts
//
// Doren & Tawanna animated email signature — HTML block appended to
// outgoing marketing emails from the CRM composer.

const GIF_URL = process.env.NEXT_PUBLIC_SIGNATURE_GIF_URL ?? '';
const APP_STORE_BADGE =
  'https://b2lqsyyhvbkewrwf.public.blob.vercel-storage.com/email/app-store-badge.png';
const GOOGLE_PLAY_BADGE =
  'https://b2lqsyyhvbkewrwf.public.blob.vercel-storage.com/email/google-play-badge.jpg';

const FB_ICON = 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@latest/icons/facebook.svg';
const IG_ICON = 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@latest/icons/instagram.svg';
const LI_ICON = 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons@latest/icons/linkedin.svg';

function buildSignatureHtml(): string {
  if (!GIF_URL) return '';
  return `
<!-- BEGIN Doren & Tawanna signature -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;margin-top:24px;font-family:'Helvetica Neue',Arial,sans-serif;color:#111827;">
  <tr>
    <td width="210" valign="top" style="width:210px;padding:0 18px 0 0;">
      <a href="https://realtynewsnow.app" target="_blank" style="text-decoration:none;">
        <img src="${GIF_URL}" width="210" height="210" alt="Doren and Tawanna" style="display:block;width:210px;height:210px;border:0;outline:none;text-decoration:none;">
      </a>
    </td>
    <td valign="top" style="padding:42px 0 0 0;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:20px;font-weight:700;color:#111827;">DOREN CARVER &amp; TAWANNA VEROCK</div>
      <div style="padding-top:2px;font-size:10px;line-height:15px;color:#6b7280;">Co-publishers of RealtyLine Austin | Newsline SA | Realty News Now App</div>
      <div style="padding-top:9px;font-size:12px;line-height:18px;color:#374151;">P.O. Box 81366, Austin, TX 78708</div>
      <div style="font-size:12px;line-height:18px;color:#374151;">Doren: <a href="mailto:doren@myrealtyline.com" style="color:#374151;text-decoration:none;">doren@myrealtyline.com</a> | <a href="tel:+15125143141" style="color:#374151;text-decoration:none;">(512) 514-3141</a></div>
      <div style="font-size:12px;line-height:18px;color:#374151;">Tawanna: <a href="mailto:tawanna@myrealtyline.com" style="color:#374151;text-decoration:none;">tawanna@myrealtyline.com</a> | <a href="tel:+15129650057" style="color:#374151;text-decoration:none;">(512) 965-0057</a></div>
      <div style="padding-top:6px;font-size:11px;line-height:17px;">
        <a href="https://realtyline.us" style="color:#7c3aed;text-decoration:none;">realtyline.us</a>
        <span style="color:#9ca3af;"> | </span>
        <a href="https://newslinesa.com" style="color:#7c3aed;text-decoration:none;">newslinesa.com</a>
        <span style="color:#9ca3af;"> | </span>
        <a href="https://realtynewsnow.app" style="color:#7c3aed;text-decoration:none;">realtynewsnow.app</a>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>
        <td style="padding-right:10px;"><a href="https://apps.apple.com/app/id6782394889" target="_blank"><img src="${APP_STORE_BADGE}" width="120" height="40" alt="Download on the App Store" style="display:block;width:120px;height:40px;border:0;"></a></td>
        <td><a href="https://realtynewsnow.app" target="_blank"><img src="${GOOGLE_PLAY_BADGE}" width="135" height="40" alt="Get it on Google Play" style="display:block;width:135px;height:40px;border:0;"></a></td>
      </tr></table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr>
        <td style="padding-right:14px;"><a href="https://www.facebook.com/" target="_blank"><img src="${FB_ICON}" width="18" height="18" alt="Facebook" style="display:block;border:0;"></a></td>
        <td style="padding-right:14px;"><a href="https://www.instagram.com/" target="_blank"><img src="${IG_ICON}" width="18" height="18" alt="Instagram" style="display:block;border:0;"></a></td>
        <td><a href="https://www.linkedin.com/" target="_blank"><img src="${LI_ICON}" width="18" height="18" alt="LinkedIn" style="display:block;border:0;"></a></td>
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
