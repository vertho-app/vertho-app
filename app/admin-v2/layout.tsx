import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { checarAcessoPlataforma } from '@/lib/authz-plataforma';
import ShellV2 from './_shell/ShellV2';

export const dynamic = 'force-dynamic';

/**
 * Protótipo navegável da arquitetura administrativa proposta
 * (ver deliverables/ARQUITETURA-ADMIN-CONSOLIDADA-2026-08.md).
 *
 * Vive FORA de /admin de propósito: `app/admin/layout.tsx` embrulha tudo no
 * AdminShell atual, e um protótipo do shell novo dentro do shell velho renderiza
 * duas sidebars. Por isso a mesma régua de acesso é reaplicada aqui —
 * `checarAcessoPlataforma` é o núcleo em lib/, o mesmo que o gate de /admin usa
 * (chamamos o núcleo, não a action 'use server').
 */
export default async function AdminV2Layout({ children }: { children: React.ReactNode }) {
  const { authorized, reason } = await checarAcessoPlataforma();

  if (reason === 'unauthenticated') {
    redirect('/login?redirect=/admin-v2');
  }

  if (!authorized) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-[#07162a] px-6 text-center">
        <ShieldAlert size={48} className="text-red-400" />
        <p className="text-lg font-semibold text-white">Acesso restrito</p>
        <p className="text-sm text-gray-400">Esta área é exclusiva de administradores da plataforma.</p>
        <Link
          href="/dashboard"
          className="mt-2 rounded-lg border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-400 transition-colors hover:bg-cyan-400/10"
        >
          Voltar ao dashboard
        </Link>
      </div>
    );
  }

  return <ShellV2>{children}</ShellV2>;
}
