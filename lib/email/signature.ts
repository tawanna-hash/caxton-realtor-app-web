// Tawanna's static, email-safe CRM signature. Contact and brand content remains
// selectable HTML; images are hosted from Realty News Now's public directory.
const HEADSHOT_URL =
  'https://realtynewsnow.app/email/tawanna-verock-headshot-uncropped-20260827.jpg';
const WORDMARK_GIF_URL =
  'https://realtynewsnow.app/email/tawanna-boss-signature.gif';
const APP_STORE_BADGE_URL =
  'https://realtynewsnow.app/product-tour/app-store-badge.png';
const GOOGLE_PLAY_BADGE_URL =
  'https://realtynewsnow.app/product-tour/google-play-badge.png';
const FACEBOOK_ICON_URL = 'https://realtynewsnow.app/email/facebook.png';
const INSTAGRAM_ICON_URL = 'https://realtynewsnow.app/email/instagram.png';
const LINKEDIN_ICON_URL = 'https://realtynewsnow.app/email/linkedin.png';

function buildSignatureHtml(): string {
  return `
<!-- BEGIN Tawanna Verock signature -->
<div style="width:100%;max-width:620px;margin-top:24px;margin-bottom:8px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
  <img src="${WORDMARK_GIF_URL}" width="240" alt="Tawanna" style="display:block;width:240px;height:auto;border:0;outline:none;text-decoration:none;">
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:620px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#202124;border-collapse:collapse;">
  <tr>
    <td width="128" valign="top" style="width:128px;padding:2px 18px 0 0;">
      <a href="https://realtynewsnow.app" target="_blank" style="text-decoration:none;">
        <img src="${HEADSHOT_URL}" width="120" alt="Tawanna Verock" style="display:block;width:120px;height:auto;border:0;border-radius:8px;outline:none;text-decoration:none;">
      </a>
    </td>
    <td valign="top" style="padding:0 0 0 18px;border-left:3px solid #301D5D;">
      <div style="font-size:19px;line-height:23px;font-weight:700;letter-spacing:0.4px;color:#17131f;">TAWANNA VEROCK</div>
      <div style="padding-top:2px;font-size:12px;line-height:17px;font-weight:700;letter-spacing:0.2px;color:#6d28d9;">Co-Owner&nbsp; | &nbsp;Co-Publisher</div>

      <div style="padding-top:7px;font-size:11px;line-height:17px;color:#4b4653;">
        <a href="https://realtyline.us" target="_blank" style="color:#4b4653;text-decoration:none;">RealtyLine Austin</a>
        <span style="color:#9b96a2;">&nbsp;&bull;&nbsp;</span>
        <a href="https://newslinesa.com" target="_blank" style="color:#4b4653;text-decoration:none;">Newsline San Antonio</a>
        <span style="color:#9b96a2;">&nbsp;&bull;&nbsp;</span>
        <a href="https://realtynewsnow.app" target="_blank" style="color:#4b4653;text-decoration:none;">Realty News Now App</a>
      </div>

      <div style="padding-top:6px;font-size:11px;line-height:17px;color:#4b4653;">
        <a href="mailto:tawanna@realtynewsnow.app" style="color:#4b4653;text-decoration:none;">tawanna@realtynewsnow.app</a>
        <span style="color:#9b96a2;">&nbsp; | &nbsp;</span>
        <a href="tel:+15129650057" style="color:#4b4653;text-decoration:none;">(512) 965-0057</a><br>
        P.O. Box 81366, Austin, TX 78708
      </div>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:9px;border-collapse:collapse;">
        <tr>
          <td valign="middle" style="padding:0 7px 0 0;">
            <a href="https://apps.apple.com/app/id6782394889" target="_blank" style="text-decoration:none;">
              <img src="${APP_STORE_BADGE_URL}" width="112" alt="Download Realty News Now on the App Store" style="display:block;width:112px;height:auto;border:0;outline:none;text-decoration:none;">
            </a>
          </td>
          <td valign="middle" style="padding:0 11px 0 0;">
            <a href="https://play.google.com/store/apps/details?id=app.realtynewsnow" target="_blank" style="text-decoration:none;">
              <img src="${GOOGLE_PLAY_BADGE_URL}" width="121" alt="Get Realty News Now on Google Play" style="display:block;width:121px;height:auto;border:0;outline:none;text-decoration:none;">
            </a>
          </td>
          <td valign="middle" style="padding:0 5px 0 0;">
            <a href="https://www.facebook.com/myrealtyline" target="_blank" title="RealtyLine on Facebook" style="text-decoration:none;">
              <img src="${FACEBOOK_ICON_URL}" width="24" height="24" alt="Facebook" style="display:block;width:24px;height:24px;border:0;outline:none;text-decoration:none;">
            </a>
          </td>
          <td valign="middle" style="padding:0 5px 0 0;">
            <a href="https://www.instagram.com/myrealtyline" target="_blank" title="RealtyLine on Instagram" style="text-decoration:none;">
              <img src="${INSTAGRAM_ICON_URL}" width="24" height="24" alt="Instagram" style="display:block;width:24px;height:24px;border:0;outline:none;text-decoration:none;">
            </a>
          </td>
          <td valign="middle" style="padding:0;">
            <a href="https://www.linkedin.com/company/myrealtyline" target="_blank" title="RealtyLine on LinkedIn" style="text-decoration:none;">
              <img src="${LINKEDIN_ICON_URL}" width="24" height="24" alt="LinkedIn" style="display:block;width:24px;height:24px;border:0;outline:none;text-decoration:none;">
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<!-- END Tawanna Verock signature -->
`.trim();
}

export function appendSignature(body: string, opts?: { skip?: boolean }): string {
  if (opts?.skip) return body;
  const sig = buildSignatureHtml();
  if (!sig) return body;
  return `${body}\n\n${sig}`;
}
