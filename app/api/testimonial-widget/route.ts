import { NextResponse } from 'next/server';
import { getPublicShowcase } from '@/lib/server/testimonials-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character);
}

function safeWebUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const searchParams = new URL(req.url).searchParams;
  const slug = searchParams.get('slug')?.trim();
  const responseFormat = searchParams.get('format');
  const requestedLayout = searchParams.get('layout');
  const requestedTheme = searchParams.get('theme');
  const layout = requestedLayout === 'carousel' || requestedLayout === 'single' ? requestedLayout : 'grid';
  const theme = requestedTheme === 'dark' ? 'dark' : 'light';
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

  const palette = theme === 'dark'
    ? {
      background: '#17151c',
      card: '#221f2a',
      border: '#3b3547',
      text: '#f7f4fb',
      muted: '#b9b1c5',
      accent: '#d2bdff',
      button: '#f7f4fb',
      buttonText: '#301d5d',
    }
    : {
      background: '#faf8f4',
      card: '#ffffff',
      border: '#e5e0d8',
      text: '#171717',
      muted: '#6b7280',
      accent: '#301d5d',
      button: '#301d5d',
      buttonText: '#ffffff',
    };
  const testimonials = layout === 'single'
    ? showcase.testimonials.slice(0, 1)
    : showcase.testimonials;
  const cardWidth = layout === 'carousel' ? 'min-width:min(82vw,360px);scroll-snap-align:start;' : '';
  const cards = testimonials.map((testimonial) => {
    const mediaLabel = testimonial.format === 'audio'
      ? 'Listen to testimonial'
      : testimonial.format === 'video'
        ? 'Watch testimonial'
        : '';
    const mediaIcon = testimonial.format === 'audio' ? '◉' : '▶';
    const mediaUrl = safeWebUrl(testimonial.video_url);
    const mediaLink = mediaLabel && mediaUrl
      ? `<a href="${escapeHtml(mediaUrl)}" target="_blank" rel="noreferrer" style="display:inline-flex;align-items:center;gap:7px;margin-top:16px;color:${palette.accent};font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:3px">${mediaIcon} ${mediaLabel}</a>`
      : '';
    const attribution = [testimonial.client_title, testimonial.client_company]
      .filter(Boolean)
      .map(escapeHtml)
      .join(', ');
    return `<article style="box-sizing:border-box;${cardWidth}border:1px solid ${palette.border};border-radius:14px;padding:24px;background:${palette.card};color:${palette.text}"><div style="color:#d97706;margin-bottom:12px;letter-spacing:1px">${'★'.repeat(testimonial.rating ?? 0)}</div><blockquote style="font-size:18px;line-height:1.65;margin:0 0 18px">“${escapeHtml(testimonial.quote)}”</blockquote>${mediaLink}<footer style="display:flex;align-items:center;gap:12px;margin-top:18px;padding-top:16px;border-top:1px solid ${palette.border}">${testimonial.image_url ? `<img src="${escapeHtml(testimonial.image_url)}" alt="" loading="lazy" style="width:44px;height:44px;border-radius:50%;object-fit:cover">` : ''}<div><strong style="display:block;font-size:14px">${escapeHtml(testimonial.client_name)}</strong><span style="font-size:13px;color:${palette.muted}">${attribution}</span></div></footer></article>`;
  }).join('');
  const empty = `<p style="color:${palette.muted};margin:0">Published testimonials will appear here.</p>`;
  const body = layout === 'carousel'
    ? `<div data-rnn-track style="display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 12px;scrollbar-width:thin">${cards || empty}</div>${testimonials.length > 1 ? `<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button type="button" data-rnn-prev aria-label="Previous testimonial" style="width:42px;height:42px;border:1px solid ${palette.border};border-radius:999px;background:${palette.button};color:${palette.buttonText};cursor:pointer;font-size:18px">←</button><button type="button" data-rnn-next aria-label="Next testimonial" style="width:42px;height:42px;border:1px solid ${palette.border};border-radius:999px;background:${palette.button};color:${palette.buttonText};cursor:pointer;font-size:18px">→</button></div>` : ''}`
    : `<div style="display:grid;grid-template-columns:${layout === 'single' ? 'minmax(0,680px)' : 'repeat(auto-fit,minmax(260px,1fr))'};gap:16px">${cards || empty}</div>`;
  const title = [showcase.profile.professional_title, showcase.profile.company]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ');
  const headshot = showcase.profile.headshot_url
    ? `<img src="${escapeHtml(showcase.profile.headshot_url)}" alt="" loading="lazy" style="width:56px;height:56px;border-radius:50%;object-fit:cover">`
    : '';
  const websiteUrl = safeWebUrl(showcase.profile.website_url);
  const profileName = websiteUrl
    ? `<a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noreferrer" style="color:${palette.text};text-decoration:none"><strong style="font-size:20px">${escapeHtml(showcase.profile.display_name)}</strong></a>`
    : `<strong style="font-size:20px">${escapeHtml(showcase.profile.display_name)}</strong>`;
  const html = `<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">${headshot}<div>${profileName}<div style="color:${palette.muted};font-size:14px">${title}</div></div></div>${body}`;
  const safeSlug = slug.replace(/[^a-z0-9-]/g, '');
  const styles = {
    fontFamily: 'Arial, sans-serif',
    maxWidth: '1100px',
    margin: '32px auto',
    padding: '24px',
    borderRadius: '18px',
    background: palette.background,
    color: palette.text,
  };

  if (responseFormat === 'json') {
    return NextResponse.json(
      { html, styles },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  const script = `(()=>{const s=document.currentScript;if(!s)return;const t=document.createElement("section");t.setAttribute("data-rnn-testimonials","${safeSlug}");const bind=()=>{const track=t.querySelector("[data-rnn-track]");if(!track)return;const move=n=>track.scrollBy({left:n*track.clientWidth*.82,behavior:"smooth"});t.querySelector("[data-rnn-prev]")?.addEventListener("click",()=>move(-1));t.querySelector("[data-rnn-next]")?.addEventListener("click",()=>move(1))};const render=(html,styles)=>{Object.assign(t.style,styles);if(t.innerHTML!==html){t.innerHTML=html;bind()}};render(${safeJson(html)},${safeJson(styles)});const target=document.querySelector('[data-rnn-testimonials="${safeSlug}"]');if(target&&target!==t){target.replaceWith(t)}else{s.insertAdjacentElement("afterend",t)}const endpoint=new URL(s.src,location.href);endpoint.searchParams.set("format","json");const refresh=async()=>{try{endpoint.searchParams.set("_",Date.now().toString());const response=await fetch(endpoint,{cache:"no-store",mode:"cors"});if(!response.ok)return;const data=await response.json();render(data.html,data.styles)}catch{}};const timer=setInterval(refresh,30000);window.addEventListener("pagehide",()=>clearInterval(timer),{once:true})})();`;

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
