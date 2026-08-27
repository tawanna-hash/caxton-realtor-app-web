// Tawanna's static, email-safe signature. All content remains selectable HTML;
// the headshot is the signature's only image.
const HEADSHOT_URL =
  'https://realtynewsnow.app/email/tawanna-verock-headshot-20260827.png';

function buildSignatureHtml(): string {
  return `
<!-- BEGIN Tawanna Verock signature -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:520px;margin-top:24px;font-family:Arial,'Helvetica Neue',sans-serif;color:#202124;">
  <tr>
    <td width="112" valign="top" style="width:112px;padding:0 16px 0 0;">
      <a href="https://realtynewsnow.app" target="_blank" style="text-decoration:none;">
        <img src="${HEADSHOT_URL}" width="112" height="112" alt="Tawanna Verock" style="display:block;width:112px;height:112px;border:0;border-radius:56px;outline:none;text-decoration:none;">
      </a>
    </td>
    <td valign="top" style="padding:1px 0 0 0;">
      <div style="font-size:17px;line-height:21px;font-weight:700;color:#111827;">Tawanna Verock</div>
      <div style="padding-top:1px;font-size:12px;line-height:17px;font-weight:600;color:#6d28d9;">Co-Publisher</div>
      <div style="padding-top:7px;font-size:12px;line-height:18px;color:#374151;">
        <a href="mailto:tawanna@myrealtyline.com" style="color:#374151;text-decoration:none;">tawanna@myrealtyline.com</a>
        <span style="color:#9ca3af;">&nbsp;|&nbsp;</span>
        <a href="tel:+15129650057" style="color:#374151;text-decoration:none;">(512) 965-0057</a>
      </div>
      <div style="font-size:12px;line-height:18px;color:#374151;">P.O. Box 81366, Austin, TX 78708</div>
      <div style="padding-top:5px;font-size:11px;line-height:17px;">
        <a href="https://realtyline.us" target="_blank" style="color:#6d28d9;text-decoration:none;">RealtyLine Austin</a>
        <span style="color:#9ca3af;">&nbsp;|&nbsp;</span>
        <a href="https://newslinesa.com" target="_blank" style="color:#6d28d9;text-decoration:none;">Newsline San Antonio</a>
        <br>
        <a href="https://realtynewsnow.app" target="_blank" style="color:#6d28d9;text-decoration:none;">Realty News Now App</a>
      </div>
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
