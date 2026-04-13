import { redirect } from 'next/navigation';

// /dashboard/home foi promovida a /dashboard (layout oficial).
// Mantém o path redirecionando pra não quebrar links antigos.
export default function HomeRedirect() {
  redirect('/dashboard');
}
