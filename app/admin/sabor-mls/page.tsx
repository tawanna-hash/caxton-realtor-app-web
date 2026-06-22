import { redirect } from 'next/navigation';

/**
 * Legacy admin path. The SABOR MLS editor moved to
 * /admin/content/saborreport (now grouped under the Content nav).
 * Keep this stub so existing bookmarks and external links keep working.
 */
export default function SaborMlsLegacyRedirect() {
  redirect('/admin/content/saborreport');
}
