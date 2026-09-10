import Link from 'next/link';
import { ArrowRight, ExternalLink, GitBranch, TriangleAlert } from 'lucide-react';
import { carregarConteudo, type Cartao } from './actions';
import { ABAS } from './abas';

export const metadata = { title: 'Fluxo de conteúdo · Admin por fluxo' };
export const dynamic = 'force-dynamic';

const TOM: Record<Cartao['tom'], string> = {
  ok: 'text-[var(--success)]',
  atencao: 'text-[var(--warning)]',
  critico: 'text-[#ff9b90]',
  neutro: 'text-[var(--ink)]',
};

const ATALHOS: Record<string, { rotulo: string; detalhe: string; href: string }[]> = {
  demandas: [
    { rotulo: 'Cobertura por descritor', detalhe: 'encontrar assuntos descobertos', href: '/admin/vertho/modulos-base/cobertura' },
    { rotulo: 'Knowledge base', detalhe: 'corrigir fontes e vetores', href: '/admin/vertho/knowledge-base' },
  ],
  producao: [
    { rotulo: 'Extrair de material', detalhe: 'vídeo, documento ou transcrição', href: '/admin/vertho/modulos-base/extracao-video' },
    { rotulo: 'Importar manuscrito', detalhe: 'transformar texto em módulo', href: '/admin/vertho/modulos-base/importar-manuscrito' },
    { rotulo: 'Gerar kit semanal', detalhe: 'produzir prateleira por DISC', href: '/admin/conteudos/kit' },
  ],
  revisao: [
    { rotulo: 'Módulos-base', detalhe: 'revisar descritor, conteúdo e status', href: '/admin/vertho/modulos-base' },
    { rotulo: 'Métricas de vídeo', detalhe: 'diagnosticar renders com erro', href: '/admin/videos' },
  ],
  publicado: [
    { rotulo: 'Biblioteca mestre', detalhe: 'módulos disponíveis na jornada', href: '/admin/vertho/modulos-base' },
    { rotulo: 'Micro-conteúdos', detalhe: 'pílulas e vínculos com módulos', href: '/admin/conteudos' },
    { rotulo: 'Kits por coorte', detalhe: 'inspecionar o que foi distribuído', href: '/admin/conteudos/kit/coorte' },
  ],
  cobertura: [
    { rotulo: 'Cobertura por descritor', detalhe: 'ver lacunas do acervo mestre', href: '/admin/vertho/modulos-base/cobertura' },
    { rotulo: 'Preferências de aprendizagem', detalhe: 'entender aderência da entrega', href: '/admin/preferencias-aprendizagem' },
    { rotulo: 'Métricas de vídeo', detalhe: 'acompanhar geração e consumo', href: '/admin/videos' },
  ],
};

export default async function ConteudoPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  const atual = ABAS.find((item) => item.chave === aba)?.chave ?? 'demandas';
  const etapaAtual = ABAS.find((item) => item.chave === atual) ?? ABAS[0];
  const { dados, erro } = await carregarConteudo();

  if (erro || !dados) {
    return (
      <div className="rounded-[16px] border border-red-400/35 bg-red-400/[0.06] px-5 py-4 text-sm text-red-200">
        Não foi possível carregar o fluxo de conteúdo. {erro ?? 'Sem dados.'}
      </div>
    );
  }

  const cartoes = dados.cartoes[atual] ?? [];

  return (
    <div className="space-y-7">
      <section className="grid gap-6 border-b border-white/[0.08] pb-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div>
          <p className="font-[family-name:var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--cyan)]">Estúdio operacional</p>
          <h1 className="mt-2 max-w-[780px] text-[clamp(30px,4vw,50px)] font-semibold leading-[0.98] tracking-[-0.045em]">
            Conteúdo anda por <span className="font-[family-name:var(--font-serif)] font-normal italic text-[var(--cyan-soft)]">estado</span>, não por ferramenta
          </h1>
          <p className="mt-4 max-w-[70ch] text-[13.5px] leading-relaxed text-[var(--ink-dim)]">
            A lacuna nasce na cobertura, vira produção, passa por revisão e só termina quando chega à jornada com qualidade.
          </p>
        </div>
        <div className="border-l border-[#34c5cc35] pl-4">
          <div className="flex items-center gap-2 text-[var(--cyan)]">
            <GitBranch size={15} />
            <span className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em]">Etapa em foco</span>
          </div>
          <p className="mt-2 font-[family-name:var(--font-serif)] text-2xl italic text-[var(--ink)]">{etapaAtual.rotulo}</p>
          <p className="mt-1 text-[11.5px] text-[var(--ink-faint)]">{etapaAtual.sub}</p>
        </div>
      </section>

      <nav aria-label="Etapas do fluxo de conteúdo" className="overflow-x-auto pb-1">
        <ol className="flex min-w-[720px] items-start">
          {ABAS.map((item, index) => {
            const ativo = item.chave === atual;
            return (
              <li key={item.chave} className="relative flex-1 pr-2 last:pr-0">
                {index < ABAS.length - 1 && <span aria-hidden className="absolute left-6 right-0 top-[13px] h-px bg-white/[0.12]" />}
                <Link href={`/admin-v2/conteudo?aba=${item.chave}`} aria-current={ativo ? 'step' : undefined} className="group relative block rounded-[12px] px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--cyan)]">
                  <span className={`relative z-10 grid h-6 w-6 place-items-center rounded-full border font-[family-name:var(--font-manrope)] text-[9px] font-bold transition-colors ${
                    ativo
                      ? 'border-[var(--cyan)] bg-[var(--cyan)] text-[#06252a]'
                      : 'border-white/[0.16] bg-[var(--navy-deep)] text-[var(--ink-faint)] group-hover:border-[#34c5cc70] group-hover:text-[var(--cyan)]'
                  }`}>
                    {index + 1}
                  </span>
                  <span className={`mt-2 block text-[12px] font-semibold ${ativo ? 'text-[var(--cyan)]' : 'text-[var(--ink-dim)]'}`}>{item.rotulo}</span>
                  <span className="mt-0.5 block max-w-[145px] text-[10px] leading-snug text-[var(--ink-faint)]">{item.sub}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <section aria-labelledby="leitura-etapa" className="overflow-hidden rounded-[16px] border border-white/[0.08] bg-[var(--navy-card)]">
        <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
          <div>
            <p className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">Leitura da etapa</p>
            <h2 id="leitura-etapa" className="mt-1 text-[15px] font-semibold">{etapaAtual.rotulo}</h2>
          </div>
          <span className="hidden text-[10.5px] text-[var(--ink-faint)] sm:block">dados do acervo em tempo real</span>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          {cartoes.map((cartao) => (
            <div key={cartao.rotulo} className="min-w-0 border-b border-white/[0.06] px-4 py-4 last:border-b-0 sm:border-r sm:[&:nth-child(2n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2n)]:border-r xl:last:border-r-0">
              <span className={`font-[family-name:var(--font-serif)] text-[31px] leading-none tabular-nums ${TOM[cartao.tom]}`}>{cartao.valor}</span>
              <h3 className="mt-2 text-[12.5px] font-semibold">{cartao.rotulo}</h3>
              <p className="mt-1 text-[10.5px] leading-snug text-[var(--ink-faint)]">{cartao.detalhe}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="acoes-conteudo">
          <p className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">Ferramentas da etapa</p>
          <h2 id="acoes-conteudo" className="mt-1 text-lg font-semibold tracking-[-0.02em]">Onde a equipe trabalha agora</h2>
          <div className="mt-3 overflow-hidden rounded-[14px] border border-white/[0.08]">
            {(ATALHOS[atual] ?? []).map((atalho) => (
              <Link key={atalho.href} href={atalho.href} className="group flex items-center gap-4 border-b border-white/[0.06] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-white/[0.025]">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{atalho.rotulo}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--ink-faint)]">{atalho.detalhe}</span>
                </span>
                <ExternalLink size={13} className="shrink-0 text-[var(--ink-faint)] transition-colors group-hover:text-[var(--cyan)]" />
              </Link>
            ))}
          </div>
        </section>

        <aside className="border-l border-white/[0.08] pl-0 xl:pl-6">
          <div className="flex items-center gap-2">
            <TriangleAlert size={14} className={dados.lacunas.length ? 'text-[var(--warning)]' : 'text-[var(--success)]'} />
            <p className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">Sinais do acervo</p>
          </div>
          <p className="mt-2 text-sm font-semibold">{dados.lacunas.length ? `${dados.lacunas.length} lacuna(s) pedem atenção` : 'Nenhuma lacuna detectada'}</p>
          <div className="mt-3 space-y-2">
            {dados.lacunas.slice(0, 4).map((lacuna) => (
              <div key={lacuna.titulo} className={`border-l pl-3 ${lacuna.tom === 'critico' ? 'border-[#ff786b]' : 'border-[var(--warning)]'}`}>
                <p className="text-[11.5px] font-medium leading-snug">{lacuna.titulo}</p>
                <p className="mt-0.5 font-[family-name:var(--font-manrope)] text-[9.5px] text-[var(--ink-faint)]">{lacuna.quantos}</p>
                {lacuna.href && <Link href={lacuna.href} className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold text-[var(--cyan)] hover:underline">Resolver <ArrowRight size={10} /></Link>}
              </div>
            ))}
          </div>
          {atual !== 'demandas' && dados.lacunas.length > 0 && (
            <Link href="/admin-v2/conteudo?aba=demandas" className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--cyan)] hover:underline">
              Ver todas as demandas <ArrowRight size={11} />
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
