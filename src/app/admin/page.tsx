import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/dal';

export default async function AdminPage() {
  await requireAdmin();
  redirect('/admin/denuncias');
}
