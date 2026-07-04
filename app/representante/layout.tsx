// Portal do Representante — layout raiz da área /representante.
// Server component: resolve o contexto do RC uma vez e monta o shell.
import Link from 'next/link';
import { getRepresentativeContext } from '@/actions/sales/representatives';
import RepresentativeShell from '@/components/sales/representative-shell';

export const dynamic = 'force-dynamic';

export default async function RepresentanteLayout({ children }: { children: React.ReactNode }) {
  const { rep } = await getRepresentativeContext();

  if (!rep) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center p-6"
        style={{
          background:
            'radial-gradient(1100px 500px at 90% -5%, rgba(52,197,204,.07), transparent 55%), ' +
            'linear-gradient(180deg, #06172c 0%, #091d35 50%, #0a1f3a 100%)',
          color: '#d7e3ff',
        }}
      >
        <div
          className="w-full max-w-md rounded-2xl p-8 text-center"
          style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}
        >
          <img src="/logo-vertho.png" alt="Vertho" style={{ height: 26, opacity: 0.95 }} className="mx-auto" />
          <h1 className="text-lg font-bold text-white mt-5">Acesso restrito</h1>
          <p className="text-sm mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,.6)' }}>
            Área exclusiva do canal de representantes Vertho.
          </p>
          <Link
            href="/login?redirect=/representante"
            className="inline-flex items-center justify-center mt-6 px-5 py-2.5 rounded-lg text-sm font-bold transition-colors"
            style={{ background: '#34c5cc', color: '#06172c' }}
          >
            Entrar
          </Link>
        </div>
      </div>
    );
  }

  return <RepresentativeShell rep={{ name: rep.name }}>{children}</RepresentativeShell>;
}
