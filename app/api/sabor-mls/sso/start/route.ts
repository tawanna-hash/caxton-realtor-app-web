/**
 * GET /api/sabor-mls/sso/start
 *
 * Entry point for the "Sign in with SABOR" CTA on the MLS report card.
 *
 * Long-term behavior (once SABOR provisions OAuth/SAML):
 *   - Mint a state nonce, store in a short-lived signed cookie
 *   - 302 to SABOR's authorize endpoint with client_id + redirect_uri
 *   - /api/sabor-mls/sso/callback validates state, exchanges code, marks
 *     the session SABOR-verified, and 302s to the one-time download URL.
 *
 * Today: SABOR credentials are not yet wired. We render a friendly bridge
 * page that explains the gate and links to SABOR's actual login at
 * sabor.com — so the CTA never dead-ends. The page also surfaces the
 * report month label for context.
 *
 * Required env (to be added when SABOR provisions us):
 *   - SABOR_OAUTH_CLIENT_ID
 *   - SABOR_OAUTH_AUTHORIZE_URL
 *   - SABOR_OAUTH_REDIRECT_URI
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientId = process.env.SABOR_OAUTH_CLIENT_ID;
  const authorizeUrl = process.env.SABOR_OAUTH_AUTHORIZE_URL;
  const redirectUri = process.env.SABOR_OAUTH_REDIRECT_URI;
  const month = req.nextUrl.searchParams.get('month') || '';

  // Production path \u2014 SABOR creds present \u2014 hand off to their authorize URL.
  if (clientId && authorizeUrl && redirectUri) {
    const state = crypto.randomUUID();
    const url = new URL(authorizeUrl);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'member.read');
    url.searchParams.set('state', state);
    const res = NextResponse.redirect(url.toString(), { status: 302 });
    res.cookies.set('sabor_sso_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    if (month) {
      res.cookies.set('sabor_sso_month', month, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      });
    }
    return res;
  }

  // Fallback bridge page \u2014 SABOR SSO not yet configured.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SABOR Member Verification</title>
<style>
  :root { color-scheme: light; }
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
    max-width: 480px;
    width: 100%;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.05);
    overflow: hidden;
  }
  .strip { height: 4px; background: linear-gradient(90deg, #3D0740 0%, #6A1D6F 100%); }
  .body { padding: 28px 24px 24px; }
  .badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(61,7,64,0.06);
    color: #3D0740;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 14px;
  }
  h1 {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 22px;
    margin: 0 0 8px;
    color: #2A052D;
    line-height: 1.2;
  }
  .month {
    font-family: Georgia, serif;
    font-style: italic;
    color: #6B6660;
    font-size: 14px;
    margin-bottom: 16px;
  }
  p {
    font-size: 14px;
    color: #1A1A1A;
    line-height: 1.55;
    margin: 0 0 14px;
  }
  .btn {
    display: block;
    text-align: center;
    background: #3D0740;
    color: #fff;
    padding: 13px 20px;
    border-radius: 8px;
    font-weight: 600;
    text-decoration: none;
    margin-top: 18px;
    font-size: 14px;
    letter-spacing: 0.04em;
  }
  .secondary {
    display: block;
    text-align: center;
    color: #3D0740;
    padding: 12px;
    font-size: 13px;
    text-decoration: none;
    margin-top: 4px;
  }
  .foot {
    font-size: 11px;
    color: #6B6660;
    text-align: center;
    margin-top: 16px;
    line-height: 1.5;
  }
</style>
</head>
<body>
<div class="card">
  <div class="strip"></div>
  <div class="body">
    <span class="badge">\u2022 SABOR Members Only</span>
    <h1>Member Verification Required</h1>
    <div class="month">${month ? month.replace(/[<>]/g, '') + ' MLS Summary Report' : 'Monthly MLS Summary Report'}</div>
    <p>
      The SABOR MLS Summary Report is exclusive to active San Antonio Board of REALTORS\u00ae members.
      Direct sign-in from Newsline is launching shortly.
    </p>
    <p>
      In the meantime, please sign in to your SABOR member portal to access the full report.
    </p>
    <a href="https://www.sabor.com/sabor-login/" class="btn" target="_blank" rel="noopener noreferrer">
      Open SABOR Member Portal \u2192
    </a>
    <a href="/" class="secondary">Back to Newsline</a>
    <div class="foot">
      Texas A&amp;M Real Estate Research Center \u00b7 San Antonio Board of REALTORS\u00ae
    </div>
  </div>
</div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
