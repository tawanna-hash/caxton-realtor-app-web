'use client';

import { useEffect, useState } from 'react';

const BTN = 'inline-flex items-center gap-1.5 rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] disabled:opacity-50';

export default function TestimonialRequest({ address, emails, agentName }: { address: string; emails: string[]; agentName?: string }) {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/testimonial-hub', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((d) => { if (live && d?.profile?.collection_token) setLink(`${window.location.origin}/testimonial/submit/${d.profile.collection_token}`); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  const subject = `${address || 'Your Home'} - Thank You, And A Quick Favor`;
  const body = `Thank you for trusting me with your home purchase. If you have a minute, I would be grateful for a few words about your experience. You can write or record it here:\n\n${link}\n\nThank you again${agentName ? `,\n${agentName}` : '.'}`;
  const mailto = `mailto:${emails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="mt-4 rounded-md border border-[#E6E5EC] bg-[#F6F3FB] p-4">
      <h3 className="text-[14px] font-semibold text-[#1B1726]">Request A Testimonial</h3>
      <p className="mt-1 text-[14px] text-[#4A4757]">This deal closed. Send your client your testimonial link while the experience is fresh. Responses appear in Testimonials Hub for you to approve.</p>
      {failed && <p className="mt-2 text-[13px] text-[#661102]">Your testimonial link could not be loaded. Open Testimonials Hub once, then try again.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={BTN} disabled={!link} onClick={() => { void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}>{copied ? 'Copied' : 'Copy Link'}</button>
        {emails.length > 0
          ? <a className={BTN} aria-disabled={!link} href={link ? mailto : undefined}>Email Client</a>
          : <span className="text-[13px] text-[#7A7787]">Add a client email on this deal to send from here.</span>}
      </div>
    </div>
  );
}
