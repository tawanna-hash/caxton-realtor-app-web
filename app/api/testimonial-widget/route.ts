import { NextResponse } from 'next/server';
import { getPublicShowcase } from '@/lib/server/testimonials-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug')?.trim();
  if (!slug) {
    return new NextResponse('console.error("RNN Testimonials: missing profile slug");', {
      status: 400,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    });
  }

  const showcase = await getPublicShowcase(slug);
  if (!showcase) {
    return new NextResponse('console.error("RNN Testimonials: profile is unavailable");', {
      status: 404,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    });
  }

  const payload = {
    profile: {
      name: showcase.profile.display_name,
      title: showcase.profile.professional_title,
      company: showcase.profile.company,
      headshot: showcase.profile.headshot_url,
      website: showcase.profile.website_url,
    },
    testimonials: showcase.testimonials.map((testimonial) => ({
      quote: testimonial.quote,
      name: testimonial.client_name,
      title: testimonial.client_title,
      company: testimonial.client_company,
      rating: testimonial.rating,
      image: testimonial.image_url,
    })),
  };

  const script = `(()=>{const d=${safeJson(payload)},s=document.currentScript,t=document.createElement("section");t.setAttribute("data-rnn-testimonials","${slug.replace(/[^a-z0-9-]/g, '')}");t.style.cssText="font-family:Arial,sans-serif;max-width:1100px;margin:32px auto;color:#171717";const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));const cards=d.testimonials.map(x=>'<article style="box-sizing:border-box;border:1px solid #e5e7eb;border-radius:14px;padding:24px;background:#fff"><div style="color:#d97706;margin-bottom:12px">'+("★".repeat(x.rating||0))+'</div><blockquote style="font-size:18px;line-height:1.65;margin:0 0 18px">“'+esc(x.quote)+'”</blockquote><strong style="display:block;font-size:14px">'+esc(x.name)+'</strong><span style="font-size:13px;color:#6b7280">'+esc([x.title,x.company].filter(Boolean).join(", "))+'</span></article>').join("");t.innerHTML='<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">'+(d.profile.headshot?'<img src="'+esc(d.profile.headshot)+'" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover">':"")+'<div><strong style="font-size:20px">'+esc(d.profile.name)+'</strong><div style="color:#6b7280;font-size:14px">'+esc([d.profile.title,d.profile.company].filter(Boolean).join(" · "))+'</div></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">'+(cards||'<p style="color:#6b7280">Published testimonials will appear here.</p>')+'</div>';const target=document.querySelector('[data-rnn-testimonials="${slug.replace(/[^a-z0-9-]/g, '')}"]');if(target&&target!==t){target.replaceWith(t)}else{s.insertAdjacentElement("afterend",t)}})();`;

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
