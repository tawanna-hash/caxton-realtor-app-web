// Products & Services now live in Services (Beta). This forwards old links.
import { redirect } from 'next/navigation';

export default function ProductsServicesRedirect() {
  redirect('/admin/services-beta');
}
