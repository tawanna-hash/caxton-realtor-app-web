import { redirect } from 'next/navigation';

export default function GetPaidPage() {
  redirect('/admin/getpaid/accountsreceivables');
}
