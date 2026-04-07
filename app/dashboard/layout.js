import { connection } from 'next/server';
import DashboardShell from './dashboard-shell';

export default async function DashboardLayout({ children }) {
  await connection();

  return <DashboardShell>{children}</DashboardShell>;
}
