// Legacy admin path. The SABOR MLS editor canonical home is at
// /admin/content/saborreport (grouped under the Content nav), but bookmarks
// and external links to /admin/sabor-mls should keep landing on the FULL
// editor rather than a redirect to a different URL. So we just re-export
// the same client component here.

export { default } from '../content/saborreport/page';
