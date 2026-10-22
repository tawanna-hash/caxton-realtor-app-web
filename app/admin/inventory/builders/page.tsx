// Partner Pages now live inside the combined Partners workspace.
import { redirect } from 'next/navigation';

export default function AdminBuilderPagesPage() {
  redirect('/admin/crm?view=pages');
}
