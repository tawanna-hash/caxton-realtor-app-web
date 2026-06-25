'use client';

// Renders Swagger UI by loading the official CDN bundle on the client.
// We deliberately avoid the swagger-ui-react npm package — it pulls in
// a large React tree that conflicts with React 19, and we don't need
// the SSR. CSP-friendly: spec is same-origin.

import { useEffect, useRef } from 'react';

type SwaggerUIBundle = (config: {
  url: string;
  dom_id: string;
  deepLinking?: boolean;
  presets?: unknown[];
  layout?: string;
}) => void;

declare global {
  interface Window {
    SwaggerUIBundle?: SwaggerUIBundle & { presets: { apis: unknown } };
  }
}

const SWAGGER_VERSION = '5.17.14';
const SWAGGER_CSS = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css`;
const SWAGGER_JS = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js`;

export default function ApiDocsClient({ specUrl }: { specUrl: string }) {
  const containerId = 'swagger-ui-container';
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Inject Swagger UI CSS once.
    if (!document.querySelector('link[data-swagger-ui]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = SWAGGER_CSS;
      link.setAttribute('data-swagger-ui', '1');
      document.head.appendChild(link);
    }

    // Inject Swagger UI bundle once, then init.
    const init = () => {
      const Bundle = window.SwaggerUIBundle;
      if (!Bundle) return;
      Bundle({
        url: specUrl,
        dom_id: `#${containerId}`,
        deepLinking: true,
        presets: [Bundle.presets.apis],
        layout: 'BaseLayout',
      });
    };

    if (window.SwaggerUIBundle) {
      init();
    } else {
      const script = document.createElement('script');
      script.src = SWAGGER_JS;
      script.async = true;
      script.onload = init;
      document.body.appendChild(script);
    }
  }, [specUrl]);

  return <div id={containerId} className="px-6 py-6" />;
}
