import type { Metadata } from 'next';
import Link from 'next/link';
import { GraduationCap, MapPin, ArrowRight, Search } from 'lucide-react';
import { BettHeader } from '../_components/bett-header';
import { buscarEscolasAvancado } from '../../radar/actions';
import { BuscaForm } from './_form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Busca avançada de escolas',
  description:
    'Encontre escolas no Radar Vertho filtrando por UF, rede (privada, estadual, municipal, federal) e etapa de ensino. Busca por nome também aceita ordem livre das palavras e ignora acentos.',
  alternates: { canonical: 'https://radarbett.vertho.ai/buscar' },
};

type SP = { termo?: string; uf?: string; rede?: string; etapa?: string; pagina?: string };

export default async function BuscaAvancadaPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const termo = (sp.termo || '').trim();
  const uf = (sp.uf || '').trim().toUpperCase();
  const rede = (sp.rede || '').trim().toUpperCase();
  const etapa = (sp.etapa || '').trim();
  const pagina = Math.max(1, parseInt(sp.pagina || '1', 10) || 1);
  const PAGE_SIZE = 50;

  const valido = !!(termo || uf || rede || etapa);
  const { rows, total } = valido
    ? await buscarEscolasAvancado({
        termo: termo || undefined,
        uf: uf || undefined,
        rede: (['PRIVADA', 'MUNICIPAL', 'ESTADUAL', 'FEDERAL'].includes(rede) ? rede : undefined) as any,
        etapa: (['5_EF', '9_EF', '3_EM'].includes(etapa) ? etapa : undefined) as any,
        limit: PAGE_SIZE,
        offset: (pagina - 1) * PAGE_SIZE,
      })
    : { rows: [], total: 0 };

  const totalPaginas = Math.ceil(total / PAGE_SIZE);

  return (
    <main
      className="min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 600px at 88% -5%, rgba(52,197,204,.08), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(154,226,230,.05), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}
    >
      <BettHeader />

      <article className="max-w-[1100px] mx-auto px-6 pb-16">
        <div className="pt-10 pb-6">
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3" style={{ color: '#34c5cc' }}>
            Busca avançada
          </p>
          <h1
            className="text-white mb-3 serif"
            style={{
              fontSize: 'clamp(28px, 4vw, 42px)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              fontWeight: 600,
            }}
          >
            Explore escolas com filtros
          </h1>
          <p className="text-white/65 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
            Combine UF, rede e etapa de ensino. A busca por nome ignora acento e aceita palavras em
            qualquer ordem (ex: "tamarati colégio" encontra "Itamarati Colégio").
          </p>
        </div>

        <BuscaForm initial={{ termo, uf, rede, etapa }} />

        <section className="mt-8">
          {!valido && (
            <div
              className="rounded-2xl border p-6 text-center"
              style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <Search size={20} className="text-white/40 mx-auto mb-3" />
              <p className="text-white/65 text-sm">
                Digite um nome ou selecione ao menos um filtro acima para ver resultados.
              </p>
            </div>
          )}

          {valido && total === 0 && (
            <div
              className="rounded-2xl border p-6 text-center"
              style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <p className="text-white/70 text-sm">
                Nenhuma escola encontrada com os filtros selecionados.
              </p>
              <p className="text-[12px] text-white/40 mt-1">Tente afrouxar os filtros ou trocar a UF.</p>
            </div>
          )}

          {valido && total > 0 && (
            <>
              <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
                <p className="text-white/70 text-[13px]">
                  <strong className="text-white">{total.toLocaleString('pt-BR')}</strong> escola{total === 1 ? '' : 's'} encontrada{total === 1 ? '' : 's'}
                  {totalPaginas > 1 && (
                    <span className="text-white/40"> · página {pagina} de {totalPaginas}</span>
                  )}
                </p>
              </div>

              <ul className="space-y-2">
                {rows.map((r) => (
                  <li key={r.codigo_inep}>
                    <Link
                      href={`/escola/${r.codigo_inep}`}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border hover:bg-white/[0.03] transition-colors group"
                      style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(52,197,204,0.10)' }}
                      >
                        <GraduationCap size={16} style={{ color: '#34c5cc' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[14px] font-bold truncate">{r.nome}</p>
                        <p className="text-[11px] text-white/55 truncate flex items-center gap-2">
                          <MapPin size={10} className="flex-shrink-0" />
                          {r.municipio}/{r.uf}
                          {r.rede && <span className="text-white/35">·</span>}
                          {r.rede && <span className="text-white/65">{r.rede.charAt(0) + r.rede.slice(1).toLowerCase()}</span>}
                          {r.inse_grupo != null && <span className="text-white/35">·</span>}
                          {r.inse_grupo != null && <span className="text-white/55">INSE {r.inse_grupo}</span>}
                          <span className="text-white/35">·</span>
                          <span className="font-mono text-white/45">{r.codigo_inep}</span>
                        </p>
                      </div>
                      <ArrowRight size={14} className="text-white/30 flex-shrink-0 group-hover:text-white/70 transition-colors" />
                    </Link>
                  </li>
                ))}
              </ul>

              {totalPaginas > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  {pagina > 1 && (
                    <Link
                      href={`/buscar?${buildQS({ ...sp, pagina: String(pagina - 1) })}`}
                      className="px-4 py-2 rounded-full text-[12px] font-bold border text-white/85 hover:text-white"
                      style={{ borderColor: 'rgba(255,255,255,0.18)' }}
                    >
                      ← Anterior
                    </Link>
                  )}
                  <span className="text-[12px] text-white/55 px-3">
                    {pagina} / {totalPaginas}
                  </span>
                  {pagina < totalPaginas && (
                    <Link
                      href={`/buscar?${buildQS({ ...sp, pagina: String(pagina + 1) })}`}
                      className="px-4 py-2 rounded-full text-[12px] font-bold border text-white/85 hover:text-white"
                      style={{ borderColor: 'rgba(255,255,255,0.18)' }}
                    >
                      Próxima →
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <div className="mt-10 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12px] text-white/45 hover:text-white"
          >
            ← Voltar à busca rápida
          </Link>
        </div>
      </article>
    </main>
  );
}

function buildQS(sp: SP): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && String(v).trim()) p.set(k, String(v));
  }
  return p.toString();
}
