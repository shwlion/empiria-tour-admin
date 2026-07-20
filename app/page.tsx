import { redirect } from 'next/navigation';

// Opens straight onto the dashboard. Once Supabase Auth (admin role) is wired,
// gate this and bounce non-admins to /login or /unauthorized.
export default function Home() {
  redirect('/dashboard');
}
