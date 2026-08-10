import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { checarAcessoPlataforma } from '@/lib/authz-plataforma';

/**
 * O Radar saiu do ar público em 10/08/2026 (decisão do dono). Era
 * `radar.vertho.ai`, sem login e indexável; virou ferramenta INTERNA em
 * `app.vertho.ai/radar`, com a mesma régua do /admin (`platform_admins`).
 *
 * ⚠️ Este gate protege a PÁGINA, não os dados. Quem entrega os dados são as
 * Server Actions de `actions.ts` — cada export é um endpoint HTTP, chamável sem
 * passar por layout nenhum. O gate delas está lá, uma a uma, e é o que de fato
 * fecha a superfície. Ver `tests/unit/security/radar-interno-guard.test.ts`.
 */
export const metadata: Metadata = {
  title: {
    default: 'Radar Vertho — inteligência de mercado (interno)',
    template: '%s · Radar Vertho',
  },
  description: 'Ferramenta interna Vertho. Indicadores oficiais de Saeb, Ideb e ICA por escola e município.',
  applicationName: 'Radar Vertho',
  // Ferramenta interna não pede indexação. O `noindex` é a segunda linha: a
  // primeira é o 301 de radar.vertho.ai e o gate abaixo — crawler não passa
  // por login.
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export const dynamic = 'force-dynamic';

export default async function RadarLayout({ children }: { children: React.ReactNode }) {
  const acesso = await checarAcessoPlataforma();

  if (acesso.reason === 'unauthenticated') {
    redirect('/login?redirect=/radar');
  }

  if (!acesso.authorized) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-[#07162a] px-6 text-center">
        <ShieldAlert size={48} className="text-red-400" />
        <p className="text-lg font-semibold text-white">Acesso restrito</p>
        <p className="text-sm text-gray-400">
          O Radar é uma ferramenta interna da Vertho.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 rounded-lg border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-400 transition-colors hover:bg-cyan-400/10"
        >
          Voltar ao painel
        </Link>
      </div>
    );
  }

  return <div className="radar-shell">{children}</div>;
}
