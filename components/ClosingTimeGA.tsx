'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

const CLOSING_TIME_HOSTS = ['itsalmostclosingtime.com', 'www.itsalmostclosingtime.com'];

/**
 * Google tag (gtag.js) for the Closing Time domain, on every page of that domain.
 * Pages whose URL carries a private token (signing, client portal, booking, auth, admin) are still
 * counted, but the reported page address is cut to the first path segment so tokens never reach Google.
 * Renders nothing on other domains or until NEXT_PUBLIC_CLOSING_TIME_GA_ID is set.
 */
export default function ClosingTimeGA() {
  const id = process.env.NEXT_PUBLIC_CLOSING_TIME_GA_ID;
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(CLOSING_TIME_HOSTS.includes(window.location.hostname.toLowerCase())); }, []);
  if (!id || !on) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`} strategy="afterInteractive" />
      <Script id="closing-time-ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          var p = location.pathname, priv = ['/sign/','/deal-portal/','/book/','/auth/','/admin'];
          var cfg = {};
          for (var i = 0; i < priv.length; i++) { if (p.indexOf(priv[i]) === 0) { var seg = '/' + p.split('/')[1] + '/redacted'; cfg = { page_location: location.origin + seg, page_path: seg }; break; } }
          gtag('config', '${id}', cfg);
        `}
      </Script>
    </>
  );
}
