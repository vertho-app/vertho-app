import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { createSupabaseAdmin } from '@/lib/supabase';
import { checkAdminAccess } from '@/app/admin/admin-actions';
import { PAINEL } from '@/lib/status';
import Acompanhar from '../_components/acompanhar';

export const dynamic = 'force-dynamic';

type Autor = { letra: string; nome: string; via: string };
type PropostaR1 = { letra: string; nome: string; via: string; resumo?: string; confidence?: number; segundos?: number };
type PropostaR2 = PropostaR1 & {
  proposta_final?: string;
  o_que_mudou_desde_r1?: string;
  recusou?: { ideia: string; de: string; porque: string }[];
  ainda_em_disputa?: string[];
};
type Sintese = {
  resumo?: string;
  resposta_final?: string;
  racional?: string;
  creditos?: { letra: string; contribuicao: string }[];
  ideias_orfas_resgatadas?: { ideia: string; de: string; por_que_resgatar: string }[];
  divergencias_reais?: { ponto: string; posicoes: string }[];
  avaliacao_da_convergencia?: string;
  riscos?: string[];
  next_steps?: string[];
  unverified_claims?: string[];
};
type Verificacao = {
  resumo?: { total: number; ok: number; quebradas: number; nao_verificavel: number };
  quebradas?: { letra: string; claim: string; source: string; status: string; detalhe?: string }[];
  tetos?: { letra: string; declarada: number | null; teto: number; efetiva: number; estourou: boolean; motivo: string }[];
};
type PremissaComum = {
  letra: string;
  premissa: string;
  tentativa_de_refutacao?: string;
  sobreviveu?: boolean;
  se_cair?: string;
};

type Resultado = {
  autores?: Autor[];
  verificacao?: Verificacao;
  premissas_comuns?: PremissaComum[];
  presenca?: { r1: string[]; r2: string[]; perdidos: { letra: string; nome: string; erro: string }[] };
  rodada1?: PropostaR1[];
  rodada2?: PropostaR2[];
  convergencia?: {
    recusas_declaradas: number;
    pontos_em_disputa: number;
    autores_sem_recusa: string[];
    alerta_conformidade: boolean;
  };
  sintese?: Sintese | null;
  arquivos_de_apoio?: { nome: string; kb: number }[];
  metricas?: { segundos: number; custo_claude_usd: number };
};

const md = 'prose prose-invert prose-sm max-w-none prose-headings:text-white prose-headings:font-semibold prose-a:text-cyan-300 prose-strong:text-white prose-code:text-cyan-200 prose-table:text-[13px]';

export default async function PainelPage({ params }: { params: Promise<{ id: string }> }) {
  const acesso = await checkAdminAccess();
  if (!acesso.authorized) redirect('/login?redirect=/admin/vertho/board');

  const { id } = await params;
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('board_paineis').select('*').eq('id', id).single();
  if (error || !data) notFound();

  const r = (data.resultado || null) as Resultado | null;
  const s = r?.sintese || null;
  const conv = r?.convergencia;
  const emAndamento = data.status === PAINEL.PENDENTE || data.status === PAINEL.RODANDO;

  return (
    <div className="max-w-[900px] mx-auto px-4 py-8 sm:px-6">
      <Link href="/admin/vertho/board" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 mb-6">
        <ArrowLeft className="w-4 h-4" /> Board
      </Link>

      <header className="mb-7">
        <h1 className="text-2xl sm:text-3xl font-semibold text-white">{data.titulo || 'Painel'}</h1>
        <p className="text-white/50 mt-3 text-[15px] whitespace-pre-wrap">{data.pergunta}</p>
        {data.contexto_dir && (
          <p className="text-[11px] text-white/25 font-mono mt-3">
            contexto: {String(data.contexto_dir).split('\\').pop()}
            {r?.arquivos_de_apoio?.length ? ` · ${r.arquivos_de_apoio.length} arquivo(s)` : ''}
          </p>
        )}
      </header>

      {emAndamento && (
        <Acompanhar
          id={id}
          statusInicial={data.status}
          progressoInicial={(data.progresso as never[]) || []}
          criadoEm={data.criado_em}
        />
      )}

      {data.status === PAINEL.ERRO && (
        <div className="rounded-2xl border border-red-400/25 bg-red-400/[0.05] px-5 py-4">
          <p className="text-red-300 font-medium text-sm">O painel falhou</p>
          <p className="text-white/60 text-[13px] mt-1.5 font-mono break-words">{data.erro}</p>
        </div>
      )}

      {s && (
        <>
          {/* métricas do painel — o que aconteceu de fato */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.06] rounded-2xl overflow-hidden mb-7">
            {[
              { n: `${r?.presenca?.r2.length ?? 0}/${r?.autores?.length ?? 0}`, l: 'modelos até o fim' },
              { n: String(conv?.recusas_declaradas ?? 0), l: 'ideias recusadas' },
              { n: String(conv?.pontos_em_disputa ?? 0), l: 'pontos em disputa' },
              { n: data.segundos ? (data.segundos < 90 ? `${data.segundos}s` : `${Math.round(data.segundos / 60)} min`) : '—', l: 'duração' },
            ].map((m) => (
              <div key={m.l} className="px-4 py-3.5" style={{ background: '#091D35' }}>
                <p className="text-xl text-white font-semibold tabular-nums">{m.n}</p>
                <p className="text-[11px] text-white/35 mt-0.5">{m.l}</p>
              </div>
            ))}
          </div>

          {conv?.alerta_conformidade && (
            <div className="flex gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] px-5 py-4 mb-7">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <p className="text-[13px] text-amber-200/90">
                <b>Convergência suspeita.</b> Ninguém recusou nenhuma ideia dos outros e ninguém viu ponto em disputa.
                Quatro modelos concordando sem uma única recusa é o padrão de conformidade, não de verdade — leia a
                resposta com mais desconfiança do que o normal.
              </p>
            </div>
          )}

          {!!r?.presenca?.perdidos?.length && (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] px-5 py-4 mb-7">
              <p className="text-[13px] text-amber-200/85">
                <b>Não foi um painel completo.</b>{' '}
                {r.presenca.perdidos.map((p) => `${p.letra} (${p.nome})`).join(', ')} não terminou — a resposta saiu com{' '}
                {r.presenca.r2.length} modelos.
              </p>
            </div>
          )}

          {/* fontes conferidas em código — antes da resposta, de propósito:
              se uma citação não existe, isso muda como se lê tudo o que vem depois */}
          {!!r?.verificacao?.resumo?.total && (
            <section className="mb-7">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-white/45 font-mono mb-3">
                <span className="uppercase tracking-wider text-white/35">Fontes conferidas em código</span>
                <span className="text-emerald-300/70">{r.verificacao.resumo.ok} conferem</span>
                {!!r.verificacao.resumo.quebradas && (
                  <span className="text-amber-300/80">{r.verificacao.resumo.quebradas} não existem</span>
                )}
                <span className="text-white/30">{r.verificacao.resumo.nao_verificavel} não são arquivo</span>
              </div>

              {!!r.verificacao.quebradas?.length && (
                <ul className="flex flex-col gap-2 mb-3">
                  {r.verificacao.quebradas.map((q, i) => (
                    <li key={i} className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] px-4 py-3">
                      <p className="text-[13px] text-amber-100/90">
                        <span className="font-serif text-base text-amber-300 mr-1.5">{q.letra}</span>
                        {q.claim}
                      </p>
                      <p className="text-[11.5px] text-amber-200/60 font-mono mt-1">
                        {q.source} — {q.status}
                        {q.detalhe ? `, ${q.detalhe}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {!!r.verificacao.tetos?.filter((t) => t.estourou).length && (
                <ul className="flex flex-col gap-1.5">
                  {r.verificacao.tetos
                    .filter((t) => t.estourou)
                    .map((t) => (
                      <li key={t.letra} className="text-[12.5px] text-white/45">
                        <span className="font-serif text-base text-cyan-300/80 mr-1.5">{t.letra}</span>
                        declarou <b className="text-white/70 tabular-nums">{t.declarada}</b> de confiança, mas a
                        evidência sustenta no máximo <b className="text-white/70 tabular-nums">{t.teto}</b> — {t.motivo}
                      </li>
                    ))}
                </ul>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-cyan-400/20 px-5 sm:px-7 py-6 mb-8" style={{ background: '#08192C' }}>
            <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-300/70 font-mono mb-3">A resposta</p>
            <div className={md}>
              <ReactMarkdown>{s.resposta_final || ''}</ReactMarkdown>
            </div>
          </section>

          {!!s.ideias_orfas_resgatadas?.length && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-white mb-1">Ideias que a convergência matou</h2>
              <p className="text-white/40 text-[13px] mb-4 max-w-[62ch]">
                Estavam na primeira rodada e sumiram na última — abandonadas por pressão do grupo, não por refutação.
              </p>
              <ul className="flex flex-col gap-3">
                {s.ideias_orfas_resgatadas.map((o, i) => (
                  <li key={i} className="rounded-2xl border border-white/[0.06] border-t-2 border-t-cyan-400/40 px-5 py-4" style={{ background: '#091D35' }}>
                    <p className="text-[11px] text-white/30 font-mono mb-1.5">de {o.de}</p>
                    <p className="text-white/90 text-[15px] font-medium">{o.ideia}</p>
                    <p className="text-white/50 text-[13.5px] mt-1.5">{o.por_que_resgatar}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* rodada 1 x rodada 2, por autor */}
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-1">Como cada modelo se moveu</h2>
            <p className="text-white/40 text-[13px] mb-4 max-w-[62ch]">
              Todos escreveram sozinhos, depois leram os outros sem saber quem era quem. O que cada um{' '}
              <b className="text-white/60">recusou</b> incorporar é o que separa acordo de conformidade.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(r?.rodada2 || []).map((p) => {
                const r1 = (r?.rodada1 || []).find((x) => x.letra === p.letra);
                return (
                  <article key={p.letra} className="rounded-2xl border border-white/[0.06] px-5 py-4" style={{ background: '#091D35' }}>
                    <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
                      <span className="font-serif text-3xl text-cyan-300 leading-none">{p.letra}</span>
                      <div>
                        <p className="text-white/90 text-sm font-medium">{p.nome}</p>
                        <p className="text-[10.5px] text-white/30 font-mono">{p.via}</p>
                      </div>
                    </div>

                    <p className="text-[10.5px] uppercase tracking-wider text-white/30 font-mono mt-3.5">Rodada 1</p>
                    <p className="text-white/60 text-[13.5px] mt-1">{r1?.resumo || '—'}</p>

                    <p className="text-[10.5px] uppercase tracking-wider text-cyan-300/60 font-mono mt-3.5">Rodada 2</p>
                    <p className="text-white/80 text-[13.5px] mt-1">{p.resumo || '—'}</p>

                    <p className="text-[11px] text-white/30 font-mono mt-3 tabular-nums">
                      confiança {p.confidence ?? '—'} · recusou {(p.recusou || []).length} · vê {(p.ainda_em_disputa || []).length} em disputa
                    </p>

                    {!!p.recusou?.length && (
                      <details className="mt-3">
                        <summary className="text-[13px] text-cyan-300/80 cursor-pointer">O que recusou incorporar</summary>
                        <ul className="mt-2.5 flex flex-col gap-2.5">
                          {p.recusou.map((x, i) => (
                            <li key={i} className="border-l-2 border-white/[0.08] pl-3">
                              <p className="text-[10.5px] text-white/30 font-mono uppercase">de {x.de}</p>
                              <p className="text-white/75 text-[13px]">{x.ideia}</p>
                              <p className="text-white/45 text-[12.5px] mt-0.5">{x.porque}</p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          {/* a suposição que todos compartilharam — o ponto cego coletivo */}
          {!!r?.premissas_comuns?.length && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-white mb-1">A premissa que ninguém questionou</h2>
              <p className="text-white/40 text-[13px] mb-4 max-w-[62ch]">
                Cada autor teve de apontar a suposição que todas as propostas assumiam sem discutir e tentar derrubá-la.
                Quando ela sobrevive por falta de ataque, e não por força, a resposta inteira depende dela.
              </p>
              <ul className="flex flex-col gap-3">
                {r.premissas_comuns.map((p) => (
                  <li key={p.letra} className="rounded-2xl border border-white/[0.06] px-5 py-4" style={{ background: '#091D35' }}>
                    <div className="flex items-start gap-3">
                      <span className="font-serif text-2xl text-cyan-300 leading-none">{p.letra}</span>
                      <div className="min-w-0">
                        <p className="text-white/90 text-[14.5px] font-medium">{p.premissa}</p>
                        {p.tentativa_de_refutacao && (
                          <p className="text-white/50 text-[13px] mt-1.5">
                            <span className="text-white/30">ataque: </span>
                            {p.tentativa_de_refutacao}
                          </p>
                        )}
                        <p className="text-[12px] mt-2">
                          <span className={p.sobreviveu ? 'text-white/40' : 'text-amber-300/85'}>
                            {p.sobreviveu ? 'sobreviveu ao ataque' : 'NÃO sobreviveu'}
                          </span>
                          {p.se_cair && <span className="text-white/40"> · se cair: {p.se_cair}</span>}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s.avaliacao_da_convergencia && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-white mb-3">A convergência foi real?</h2>
              <div className={`${md} rounded-2xl border border-white/[0.06] px-5 py-4`} style={{ background: '#091D35' }}>
                <ReactMarkdown>{s.avaliacao_da_convergencia}</ReactMarkdown>
              </div>
            </section>
          )}

          {!!s.divergencias_reais?.length && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-white mb-3">O que continua sem acordo</h2>
              <ul className="flex flex-col gap-3">
                {s.divergencias_reais.map((d, i) => (
                  <li key={i} className="border-l-2 border-white/[0.1] pl-4">
                    <p className="text-white/85 text-[14.5px] font-medium">{d.ponto}</p>
                    <p className="text-white/45 text-[13px] mt-1">{d.posicoes}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-7 sm:grid-cols-2 mb-8">
            {!!s.next_steps?.length && (
              <section>
                <h2 className="text-lg font-semibold text-white mb-3">Próximos passos</h2>
                <ul className="flex flex-col gap-2.5">
                  {s.next_steps.map((p, i) => (
                    <li key={i} className="border-l-2 border-cyan-400/40 pl-3.5 text-white/70 text-[14px]">{p}</li>
                  ))}
                </ul>
              </section>
            )}
            {!!s.riscos?.length && (
              <section>
                <h2 className="text-lg font-semibold text-white mb-3">Riscos</h2>
                <ul className="flex flex-col gap-2.5">
                  {s.riscos.map((p, i) => (
                    <li key={i} className="border-l-2 border-amber-400/40 pl-3.5 text-white/70 text-[14px]">{p}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {!!s.unverified_claims?.length && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-white mb-1">O que ninguém verificou</h2>
              <p className="text-white/40 text-[13px] mb-3 max-w-[62ch]">
                Pesou na resposta e não foi conferido. Trate como hipótese.
              </p>
              <ul className="flex flex-col gap-2">
                {s.unverified_claims.map((p, i) => (
                  <li key={i} className="text-white/55 text-[13.5px] border-l-2 border-white/[0.08] pl-3.5">{p}</li>
                ))}
              </ul>
            </section>
          )}

          <footer className="pt-6 border-t border-white/[0.06] text-[12px] text-white/30">
            {!!s.creditos?.length && (
              <ul className="flex flex-col gap-1.5 mb-4">
                {s.creditos.map((c, i) => (
                  <li key={i}>
                    <span className="font-serif text-cyan-300/70 text-base mr-1.5">{c.letra}</span>
                    {c.contribuicao}
                  </li>
                ))}
              </ul>
            )}
            <p>
              Quatro CLIs rodando por assinatura na máquina local. A síntese é do Claude, que julgou as propostas sem
              saber qual modelo escreveu cada uma.
              {r?.metricas?.custo_claude_usd ? ` Custo Claude equivalente: US$ ${r.metricas.custo_claude_usd.toFixed(2)} (coberto pela assinatura).` : ''}
            </p>
          </footer>
        </>
      )}
    </div>
  );
}
