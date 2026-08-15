import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { checarAcessoPlataforma } from '@/lib/authz-plataforma';

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
  const t = await getTranslations('Home');

  if (!MARKETING_HOSTS.has(host)) {
    // Quem opera a plataforma vai para a área da equipe; o resto, para o login
    // (que sabe para onde mandar depois). Antes era `/login` para todo mundo, e
    // o atalho do PWA instalado em `app.vertho.ai` — que aponta para cá quando
    // não há tenant — deixava a equipe num vaivém de login sem destino próprio.
    const acesso = await checarAcessoPlataforma();
    redirect(acesso.authorized ? '/admin-v2' : '/login');
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
            {t('eyebrow')}
          </p>
          <h1 className="mb-6 max-w-2xl text-5xl font-semibold leading-tight text-white md:text-7xl">
            {t('title')}
          </h1>
          <p className="mb-10 max-w-xl text-lg leading-8 text-slate-300">
            {t('description')}
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="https://app.vertho.ai/login"
              className="rounded-lg bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              {t('accessPlatform')}
            </Link>
            <Link
              href="https://radar.vertho.ai"
              className="rounded-lg border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/70 hover:text-cyan-200"
            >
              {t('viewRadar')}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
