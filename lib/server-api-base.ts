import { headers } from 'next/headers';

export async function getServerApiBase(): Promise<string> {
  const h = await headers();
  const host = h.get('host') || '';

  if (host === 'realtynewsnow.app' || host.endsWith('.realtynewsnow.app')) {
    return 'https://api.realtynewsnow.app';
  }

  return process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';
}
