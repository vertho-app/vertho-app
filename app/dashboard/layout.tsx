import { connection } from 'next/server';
import DashboardShell from './dashboard-shell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection();

  return <DashboardShell>{children}</DashboardShell>;
}
