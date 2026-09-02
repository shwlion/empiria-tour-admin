import { redirect } from 'next/navigation';

// Opens straight onto the dashboard, which is guarded: its layout calls
// requireStaff(), so anyone signed out lands on /login and anyone without a
// staff role lands on /unauthorized. There is no public link to this console
// from the storefront, deliberately — staff know the address, and advertising
// it in a footer buys nothing.
export default function Home() {
  redirect('/dashboard');
}
