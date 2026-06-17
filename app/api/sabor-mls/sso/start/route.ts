/**
 * GET /api/sabor-mls/sso/start
 *
 * Entry point for the "Sign in with SABOR" CTA on the MLS report card.
 *
 * Renders a self-contained HTML gate page with a license + email form. On
 * submit the form POSTs to /api/sabor-mls/verify; on success the user is
 * redirected to the report download URL (a `sabor_verified` cookie is also
 * set for 7 days so subsequent reports auto-unlock).
 *
 * We chose this in-app gate over a federated SABOR OAuth handshake because
 * SABOR does not publish a public OAuth/SAML endpoint at sabor.mysolidearth
 * .com \u2014 only a closed myTRIBUS SPA + WebAuthn passkey flow. License + email
 * match against our ramco.sabor.com-derived member list is an acceptable
 * private-content gate.
 */

import { NextRequest } from 'next/server';
import { escapeHtml } from '@/lib/server/email/html';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get('month') || '';
  const monthLabel = month ? escapeHtml(month) : 'this month';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SABOR Member Verification &mdash; Caxton Publications</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: #FAF8F4;
    color: #1A1A1A;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.08);
    max-width: 480px;
    width: 100%;
    padding: 40px 32px;
    border: 1px solid #EAE6DE;
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 11px;
    font-weight: 600;
    color: #6B6557;
    margin-bottom: 12px;
  }
  h1 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 28px;
    line-height: 1.25;
    margin: 0 0 12px;
    color: #1A1A1A;
  }
  .sub {
    color: #4B4540;
    font-size: 15px;
    line-height: 1.55;
    margin: 0 0 24px;
  }
  label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #4B4540;
    margin-bottom: 6px;
    margin-top: 16px;
  }
  input[type="text"], input[type="email"] {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid #D6D1C7;
    border-radius: 8px;
    background: #FAF8F4;
    font-size: 15px;
    color: #1A1A1A;
    transition: border-color 0.15s, background 0.15s;
  }
  input[type="text"]:focus, input[type="email"]:focus {
    outline: none;
    border-color: #874F80;
    background: #ffffff;
    box-shadow: 0 0 0 3px rgba(61,7,64,0.10);
  }
  input[disabled] { opacity: 0.6; cursor: not-allowed; }
  .submit {
    margin-top: 24px;
    width: 100%;
    padding: 14px 18px;
    border: none;
    border-radius: 10px;
    background: #874F80;
    color: #ffffff;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.05s;
  }
  .submit:hover { background: #531055; }
  .submit:active { transform: translateY(1px); }
  .submit[disabled] { background: #8E7392; cursor: not-allowed; }
  .err {
    margin-top: 16px;
    padding: 12px 14px;
    background: #FEF2F2;
    border: 1px solid #FECACA;
    border-radius: 8px;
    color: #991B1B;
    font-size: 14px;
    line-height: 1.5;
    display: none;
  }
  .err.show { display: block; }
  .meta {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #EAE6DE;
    font-size: 12px;
    line-height: 1.6;
    color: #6B6557;
  }
  .meta a { color: #874F80; text-decoration: underline; }
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid #ffffff;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    vertical-align: -2px;
    margin-right: 8px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">SABOR Member Verification</div>
    <h1>Unlock the ${monthLabel} MLS Summary Report</h1>
    <p class="sub">Active SABOR members can access this report. Verify with your real-estate license number and the email on file with SABOR.</p>
    <form id="verifyForm">
      <label for="license">SABOR / TREC License Number</label>
      <input type="text" id="license" name="license" autocomplete="off"
             required minlength="4" maxlength="20"
             placeholder="0123456" />
      <label for="email">Email on file with SABOR</label>
      <input type="email" id="email" name="email" autocomplete="email"
             inputmode="email" required
             placeholder="you@brokerage.com" />
      <button type="submit" class="submit" id="submitBtn">Verify &amp; View Report</button>
      <div class="err" id="errBox"></div>
    </form>
    <div class="meta">
      Don\u2019t have an active SABOR membership? Visit
      <a href="https://sabor.com/membership/" target="_blank" rel="noopener">sabor.com/membership</a>
      to learn more. Need help? Email
      <a href="mailto:support@caxtonpub.com">support@caxtonpub.com</a>.
    </div>
  </div>
<script>
  (function() {
    var form = document.getElementById('verifyForm');
    var btn  = document.getElementById('submitBtn');
    var err  = document.getElementById('errBox');
    var month = ${JSON.stringify(month)};
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      err.classList.remove('show');
      err.textContent = '';
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Verifying\u2026';
      var license = document.getElementById('license').value;
      var email = document.getElementById('email').value;
      fetch('/api/sabor-mls/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ license: license, email: email, month: month }),
      }).then(function(r) { return r.json().then(function(j) { return { status: r.status, body: j }; }); })
        .then(function(res) {
          if (res.status === 200 && res.body && res.body.ok) {
            if (res.body.download_url) {
              window.location.href = res.body.download_url;
            } else {
              err.textContent = 'You\\'re verified, but the report isn\\'t published yet. Check back soon.';
              err.classList.add('show');
              btn.disabled = false;
              btn.textContent = 'Verify & View Report';
            }
          } else {
            var msg = (res.body && res.body.message) || 'Verification failed. Please try again.';
            err.textContent = msg;
            err.classList.add('show');
            btn.disabled = false;
            btn.textContent = 'Verify & View Report';
          }
        })
        .catch(function() {
          err.textContent = 'Network error. Please try again in a moment.';
          err.classList.add('show');
          btn.disabled = false;
          btn.textContent = 'Verify & View Report';
        });
    });
  })();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}


