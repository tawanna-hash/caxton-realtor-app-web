// lib/indexnow.ts
//
// IndexNow (Bing, Yandex, Seznam, Naver) URL notification. The key is public
// by design: it is served from /public/<key>.txt so engines can verify
// ownership. Override with INDEXNOW_KEY only if you rotate the key file.

export const INDEXNOW_HOST = 'realtynewsnow.app';
export const INDEXNOW_KEY =
  process.env.INDEXNOW_KEY || '5651858b0b9f25cf3dcb12265ce1ae88';

/** Submits URLs; returns true on 200/202. Max 10,000 per request. */
export async function submitToIndexNow(urls: string[]): Promise<{ ok: boolean; status: number }> {
  if (urls.length === 0) return { ok: true, status: 0 };
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: INDEXNOW_HOST,
      key: INDEXNOW_KEY,
      keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
      urlList: urls.slice(0, 10000),
    }),
  });
  return { ok: res.status === 200 || res.status === 202, status: res.status };
}
