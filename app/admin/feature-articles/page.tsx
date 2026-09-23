import { redirect } from 'next/navigation';

// Feature Articles was merged into the combined Monthly Articles admin page
// as a tab (see app/admin/articles/ArticlesClient.tsx +
// app/admin/articles/FeatureArticlesPanel.tsx). Keep this route alive so old
// bookmarks/links land on the right tab instead of a 404.
export default function AdminFeatureArticlesRedirect() {
  redirect('/admin/articles?tab=featured');
}
