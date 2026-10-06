'use client';

import { useEffect, useRef } from 'react';

/**
 * Explanation shown on hover. Nothing is drawn: the surrounding field gets a soft purple wash and a tooltip on hover.
 * The text stays available to screen readers.
 */
export default function Tip({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    host.classList.add('tip-host');
    host.setAttribute('data-tip', text);
    return () => { host.classList.remove('tip-host'); host.removeAttribute('data-tip'); };
  }, [text]);
  return <span ref={ref} className="sr-only">{text}</span>;
}
