import Link from 'next/link';
import { carregarConteudo, type Cartao } from './actions';
import { ABAS } from './abas';

export const metadata = { title: 'Estúdio de Conteúdo' };
export const dynamic = 'force-dynamic';

const TOM: Record<Cartao['tom'], string> = {
  ok: 'text-[var(--success)]',
  atencao: 'text-[var(--warning)]',
  critico: 'text-[var(--danger)]',
  neutro: 'text-[var(--ink)]',
};

const ATALHOS: Record<string, { rotulo: string; href: string }[]> = {
  biblioteca: [
    { rotulo: 'Módulos-Base', href: '/admin/vertho/modulos-base' },
    { rotulo: 'Micro-conteúdos', href: '/admin/conteudos' },
    { rotulo: 'Cobertura por descritor', href: '/admin/vertho/modulos-base/cobertura' },
  ],
  producao: [
    { rotulo: 'Extrair de vídeo ou material', href: '/admin/vertho/modulos-base/extracao-video' },
    { rotulo: 'Importar manuscrito', href: '/admin/vertho/modulos-base/importar-manuscrito' },
    { rotulo: 'Métricas de vídeo', href: '/admin/videos' },
  ],
  kits: [
    { rotulo: 'Gerar kit semanal', href: '/admin/conteudos/kit' },
    { rotulo: 'Kits por coorte', href: '/admin/conteudos/kit/coorte' },
  ],
  fontes: [{ rotulo: 'Knowledge Base', href: '/admin/vertho/knowledge-base' }],
  desempenho: [
    { rotulo: 'Métricas de vídeo', href: '/admin/videos' },
    { rotulo: 'Preferências de aprendizagem', href: '/admin/preferencias-aprendizagem' },
  ],
};

export default async function ConteudoPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  const atual = ABAS.find((a) => a.chave === aba)?.chave ?? 'biblioteca';
  const { dados, erro } = await carregarConteudo();

  if (erro || !dados) {
    return (
      <div className="rounded-2xl border border-red-400/40 bg-red-400/5 px-5 py-4 text-sm text-red-200">
        Não foi possível carregar o acervo: {erro ?? 'sem dados'}
      </div>
    );
  }

  const cartoes = dados.cartoes[atual] ?? [];

  return (
    <>
      {/* navegação local da área — o padrão que substitui 6 itens de menu */}
      <div className="flex flex-wrap gap-1 border-b border-white/[0.08]">
        {ABAS.map((a) => {
          const on = a.chave === atual;
          return (
            <Link
              key={a.chave}
              href={`/admin-v2/conteudo?aba=${a.chave}`}
              aria-current={on ? 'page' : undefined}
              className={`rounded-t-[10px] border-b-2 px-3.5 py-2.5 text-[13px] transition-colors ${
                on
                  ? 'border-[var(--cyan)] bg-[#34c5cc12] text-[var(--cyan)]'
                  : 'border-transparent text-[var(--ink-dim)] hover:bg-white/[0.03] hover:text-[var(--ink)]'
              }`}
            >
              {a.rotulo}
              <span className="ml-2 hidden font-mono text-[10px] text-[var(--ink-faint)] lg:inline">{a.sub}</span>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3.5">
        {cartoes.map((c) => (
          <div
            key={c.rotulo}
            className="flex flex-col gap-1 rounded-2xl border border-white/[0.08] bg-[var(--navy-card)] px-4 py-3.5 shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
          >
            <span className={`font-[family-name:var(--font-serif)] text-[30px] leading-none tabular-nums ${TOM[c.tom]}`}>
              {c.valor}
            </span>
            <span className="text-[13px] font-semibold">{c.rotulo}</span>
            <span className="text-[11.5px] leading-snug text-[var(--ink-faint)]">{c.detalhe}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">Abrir</span>
        {(ATALHOS[atual] ?? []).map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-full border border-white/[0.14] px-3 py-1.5 text-[12px] text-[var(--ink-dim)] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
          >
            {a.rotulo} →
          </Link>
        ))}
      </div>

      {dados.lacunas.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
              Lacunas do acervo
            </span>
            <h2 className="mt-1.5 text-base font-semibold">O que está quebrado em silêncio</h2>
            <p className="mt-1.5 max-w-[76ch] text-[13.5px] text-[var(--ink-dim)]">
              Nenhuma destas falhas aparece como erro na tela de ninguém — todas degradam entregando algo pior.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            {dados.lacunas.map((l) => (
              <div
                key={l.titulo}
                className={`grid grid-cols-[1fr_auto] items-start gap-4 rounded-2xl border border-l-2 border-white/[0.08] bg-[var(--navy-card)] px-4 py-3.5 shadow-[0_8px_20px_rgba(0,0,0,0.18)] ${
                  l.tom === 'critico' ? 'border-l-[var(--danger)]' : 'border-l-[var(--warning)]'
                }`}
              >
                <div className="min-w-0">
                  <h3 className="mb-1 text-[13.5px] font-semibold">
                    {l.titulo}{' '}
                    <span className={`ml-1 font-mono text-[11px] font-normal ${l.tom === 'critico' ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>
                      {l.quantos}
                    </span>
                  </h3>
                  <p className="max-w-[86ch] text-[12.5px] leading-relaxed text-[var(--ink-dim)]">{l.porque}</p>
                </div>
                {l.href && (
                  <Link
                    href={l.href}
                    className="shrink-0 rounded-full border border-white/[0.14] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-dim)] transition-colors hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
                  >
                    abrir
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="font-mono text-[11px] text-[var(--ink-faint)]">
        Biblioteca e Micro-conteúdos ficam em listas separadas de propósito: são dois objetos distintos, e juntá-los numa
        tela só produziria a maior concentração de controles do admin.
      </p>
    </>
  );
}
