export { default, metadata } from '../advertisers/page';

// Route segment config is per-file and does not inherit through the
// re-export above, so this must mirror ../advertisers/page's ISR settings
// directly. Same content, same safety analysis — see that file.
export const revalidate = 900; // 15 minutes
