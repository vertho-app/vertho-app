import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

const MARKETING_HOSTS = new Set([
  'vertho.ai',
  'www.vertho.ai',
  'vertho.com.br',
  'www.vertho.com.br',
]);

function normalizeHost(host: string | null): string {
  return (host || '').split(':')[0].toLowerCase();
}

export default async function Home() {
  const host = normalizeHost((await headers()).get('host'));

  if (!MARKETING_HOSTS.has(host)) {
    redirect('/login');
  }

  return (
    <main className="min-h-screen bg-[#061526] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12">
        <div className="max-w-3xl">
          <Image
            src="/logo-vertho.png"
            alt="Vertho"
            width={220}
            height={72}
            priority
            className="mb-10 h-auto w-48"
          />

          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
            Vertho Mentor IA
          </p>
          <h1 className="mb-6 max-w-2xl text-5xl font-semibold leading-tight text-white md:text-7xl">
            Desenvolvimento humano com inteligência aplicada.
          </h1>
          <p className="mb-10 max-w-xl text-lg leading-8 text-slate-300">
            Plataforma para mapear competências, orientar jornadas de aprendizagem e apoiar gestores com dados acionáveis.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="https://app.vertho.ai/login"
              className="rounded-lg bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Acessar plataforma
            </Link>
            <Link
              href="https://radar.vertho.ai"
              className="rounded-lg border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/70 hover:text-cyan-200"
            >
              Ver Radar
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
