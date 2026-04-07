import AdminGuard from './admin-guard';

export default function AdminLayout({ children }) {
  return <AdminGuard>{children}</AdminGuard>;
}
