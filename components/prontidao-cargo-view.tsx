'use client';
/**
 * PRONTIDÃO PARA O PRÓXIMO CARGO — cargo atual × cargo futuro.
 *
 * Componente compartilhado (RH self-service e preview de admin), no mesmo padrão
 * do `ranking-adequacao-view`: as actions entram por prop, então uma tela serve
 * os dois escopos sem duplicar a UI.
 *
 * TRÊS COISAS QUE A TELA DIZ DE PROPÓSITO, e o motivo de cada uma:
 *
 * 1. **"Calculado em <hora>"**, não "snapshot de <data>". O Ranking ao lado é
 *    view pura de um arquivo assado; esta comparação roda na hora. Se as duas
 *    telas usassem o mesmo vocabulário, o leitor trataria um resultado
 *    exploratório como documento de decisão.
 *
 * 2. **A aderência ATUAL fica ao lado da futura.** 88% no cargo de destino
 *    significa coisas diferentes para quem tem 95% no cargo de hoje e para quem
 *    tem 70%: sem a linha de base, o número sozinho convida à leitura errada.
 *
 * 3. **Quem reprova num requisito eliminatório vai para o fim, com o motivo.**
 *    Ordenar pela aderência colocaria alguém bloqueado no topo com 94% — a
 *    leitura exata que o gate existe para impedir.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, ShieldAlert, TrendingUp } from 'lucide-react';
import { GlassCard } from '@/components/page-shell';
import type { Prontidao, LinhaProntidao } from '@/lib/adequacao-cargo/prontidao';

const fmt = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`);
const fmtDelta = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}`);

function horaBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Cor pelo status do motor — a mesma semântica do Ranking. */
function tintaStatus(l: LinhaProntidao): { cor: string; fundo: string } {
  if (l.bloqueadoNoAlvo) return { cor: '#F87171', fundo: 'rgba(248,113,113,.12)' };
  if (l.statusAlvo === 'recomendado') return { cor: '#34D399', fundo: 'rgba(52,211,153,.12)' };
  if (l.statusAlvo === 'recomendado_com_ressalvas') return { cor: '#FBBF24', fundo: 'rgba(251,191,36,.12)' };
  return { cor: '#94A3B8', fundo: 'rgba(148,163,184,.1)' };
}

/**
 * A régua visual: onde a pessoa está hoje e onde ficaria no cargo de destino,
 * na MESMA escala de 0 a 100. Duas barras no mesmo trilho, como o relatório de
 * evolução — barra normalizada pelo próprio valor faz 3 pontos parecerem um salto.
 */
function Regua({ atual, alvo, cor }: { atual: number | null; alvo: number; cor: string }) {
  const p = (v: number) => `${Math.max(0, Math.min(100, v))}%`;
  return (
    <div className="mt-2 space-y-1">
      {atual != null && (
        <div className="h-1.5 w-full rounded-full bg-white/[0.07]">
          <div className="h-1.5 rounded-full bg-white/25" style={{ width: p(atual) }} />
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-white/[0.07]">
        <div className="h-1.5 rounded-full" style={{ width: p(alvo), background: cor }} />
      </div>
    </div>
  );
}

export default function ProntidaoCargoView({ listar, comparar, scopeKey = 'default' }: {
  listar: () => Promise<{ cargos: string[]; erro?: string }>;
  comparar: (origem: string, alvo: string) => Promise<{ success: boolean; dados?: Prontidao; error?: string }>;
  /** Identidade estável do tenant/escopo — evita relistar a cada render. */
  scopeKey?: string;
}) {
  const [cargos, setCargos] = useState<string[]>([]);
  const [origem, setOrigem] = useState('');
  const [alvo, setAlvo] = useState('');
  const [dados, setDados] = useState<Prontidao | null>(null);
  const [listando, setListando] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState('');

  // Server Actions ganham identidade nova a cada atualização de estado; o efeito
  // depende só do escopo real (mesma armadilha resolvida no ranking ao lado).
  const listarRef = useRef(listar);
  const compararRef = useRef(comparar);
  listarRef.current = listar;
  compararRef.current = comparar;
  const pedidoRef = useRef(0);

  useEffect(() => {
    let vivo = true;
    setListando(true);
    listarRef.current()
      .then((r) => {
        if (!vivo) return;
        if (r.erro) setErro(r.erro);
        setCargos(r.cargos || []);
      })
      .catch((e) => vivo && setErro(String(e?.message || e)))
      .finally(() => vivo && setListando(false));
    return () => { vivo = false; };
  }, [scopeKey]);

  const rodar = useCallback(async () => {
    if (!origem || !alvo) return;
    const meu = ++pedidoRef.current;
    setCalculando(true);
    setErro('');
    try {
      const r = await compararRef.current(origem, alvo);
      // Resposta de um par ANTIGO não pode sobrescrever o atual: sem isto, dois
      // cliques rápidos mostram o resultado do primeiro sob o rótulo do segundo.
      if (meu !== pedidoRef.current) return;
      if (r.success && r.dados) { setDados(r.dados); } else { setDados(null); setErro(r.error || 'Não foi possível calcular a comparação.'); }
    } catch (e: any) {
      if (meu === pedidoRef.current) { setDados(null); setErro(String(e?.message || e)); }
    } finally {
      if (meu === pedidoRef.current) setCalculando(false);
    }
  }, [origem, alvo]);

  const podeRodar = !!origem && !!alvo && origem !== alvo && !calculando;

  return (
    <>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">Prontidão para o próximo cargo</h1>
        <p className="mt-1 text-xs text-slate-400">
          Quem, no cargo de hoje, se aproxima do perfil ideal de outro cargo. Compara a aderência atual com a aderência ao destino.
        </p>
      </div>

      <GlassCard className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-1">
          <label className="min-w-[210px] flex-1">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Quem é hoje</span>
            <select
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <option value="">Selecione o cargo atual</option>
              {cargos.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <ArrowRight size={16} className="mb-3 shrink-0 text-slate-500" aria-hidden />

          <label className="min-w-[210px] flex-1">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Candidatos a</span>
            <select
              value={alvo}
              onChange={(e) => setAlvo(e.target.value)}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <option value="">Selecione o cargo de destino</option>
              {cargos.filter((c) => c !== origem).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <button
            type="button"
            onClick={rodar}
            disabled={!podeRodar}
            className="h-10 shrink-0 rounded-xl border border-brand-400/30 bg-brand-500/15 px-4 text-xs font-bold uppercase tracking-[0.1em] text-brand-200 transition hover:bg-brand-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {calculando ? <span className="inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Calculando…</span> : 'Comparar'}
          </button>
        </div>

        {listando && <p className="mt-2 inline-flex items-center gap-2 px-1 text-xs text-slate-400"><Loader2 size={13} className="animate-spin" /> Carregando cargos…</p>}
        {!listando && cargos.length < 2 && !erro && (
          <p className="mt-2 px-1 text-xs text-slate-500">
            A comparação precisa de pelo menos dois cargos com perfil ideal definido nesta empresa.
          </p>
        )}
      </GlassCard>

      <GlassCard className="mb-4">
        <p className="p-1 text-xs leading-relaxed text-slate-400">
          <strong className="text-slate-300">Apoio à decisão.</strong> A aderência mede o encaixe do perfil comportamental e de competências
          contra o perfil ideal do cargo — não mede desejo da pessoa, entrega recente nem tempo de casa. A conversa continua sendo do gestor.
        </p>
      </GlassCard>

      {erro && <GlassCard className="mb-4"><p className="p-1 text-sm text-amber-400">{erro}</p></GlassCard>}

      {dados && dados.indisponivel === 'sem_gabarito_alvo' && (
        <GlassCard><p className="p-1 text-sm text-slate-300">O cargo <strong>{dados.cargoAlvo}</strong> ainda não tem perfil ideal definido — sem gabarito não há contra o que comparar.</p></GlassCard>
      )}
      {dados && dados.indisponivel === 'sem_pessoas_na_origem' && (
        <GlassCard><p className="p-1 text-sm text-slate-300">Ninguém em <strong>{dados.cargoOrigem}</strong> tem mapeamento comportamental (DISC) — a comparação precisa dele.</p></GlassCard>
      )}

      {dados && !dados.indisponivel && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-slate-400">
            <span>
              <strong className="text-slate-200">{dados.avaliados}</strong>{' '}
              {dados.avaliados === 1 ? 'pessoa avaliada' : 'pessoas avaliadas'} de {dados.cargoOrigem}
            </span>
            <span>Perfil ideal de <strong className="text-slate-200">{dados.cargoAlvo}</strong></span>
            {/* Calculado, não "snapshot": esta tela recomputa a cada clique. */}
            <span>Calculado em {horaBr(dados.calculadoEm)}</span>
            {dados.faixas && (
              <span>
                Recomendado a partir de {fmt(dados.faixas.recomendadoMin)} · com ressalvas a partir de {fmt(dados.faixas.ressalvasMin)}
              </span>
            )}
          </div>

          {/* 🔴 O aviso mais forte da tela, e ele vem primeiro: quando os dois
              cargos não são distinguíveis pelo perfil, a ORDEM abaixo é ruído,
              e nenhuma leitura cuidadosa das linhas conserta isso. Medido em
              Ibipeba (10/09/2026): índice 0,47 entre Coordenação Pedagógica e
              Gestão Educacional — abaixo do acaso. */}
          {dados.separacaoEntreCargos.indistinguiveis && dados.separacaoEntreCargos.indice != null && (
            <div className="mb-3 rounded-2xl border border-red-400/30 bg-red-400/[0.07] p-4">
              <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-red-300">
                <ShieldAlert size={14} /> Estes dois cargos não se distinguem pelo perfil
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Comparando quem já ocupa <strong className="text-slate-200">{dados.cargoAlvo}</strong> ({dados.separacaoEntreCargos.nOcupantes} pessoas)
                com quem está em <strong className="text-slate-200">{dados.cargoOrigem}</strong> ({dados.separacaoEntreCargos.nCandidatos}),
                o perfil ideal do destino coloca os dois grupos praticamente na mesma faixa
                (índice {dados.separacaoEntreCargos.indice.toFixed(2).replace('.', ',')} numa escala em que 0,50 é o acaso e 1,00 é separação total).
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                Isso costuma acontecer quando os dois cargos pedem o mesmo comportamento — comum entre funções vizinhas de uma
                mesma área. A ordem abaixo não sustenta decisão de movimentação entre eles: use avaliação de entrega e de
                experiência, que é o que difere os dois na prática.
              </p>
            </div>
          )}

          {/* O aviso vem ANTES da lista, e não num rodapé: um gabarito que não
              separa produz uma ordem que parece resultado e é quase sorteio.
              Quem lê a lista sem este aviso conclui que "todo mundo está apto". */}
          {(dados.calibracaoAlvo.semDiscriminacao.length > 0 || dados.calibracaoAlvo.avisos.length > 0) && (
            <div className="mb-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.07] p-4">
              <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-300">
                <ShieldAlert size={14} /> O perfil de {dados.cargoAlvo} separa pouco este grupo
              </p>
              {dados.calibracaoAlvo.semDiscriminacao.length > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-slate-300">
                  <strong className="text-amber-200">
                    {dados.calibracaoAlvo.semDiscriminacao.length} de {dados.calibracaoAlvo.totalMedidas}
                  </strong>{' '}
                  {dados.calibracaoAlvo.semDiscriminacao.length === 1 ? 'medida do perfil dá' : 'medidas do perfil dão'}{' '}
                  praticamente a mesma nota para todas as {dados.avaliados} pessoas:{' '}
                  <span className="text-slate-400">{dados.calibracaoAlvo.semDiscriminacao.join(' · ')}</span>.
                </p>
              )}
              {dados.calibracaoAlvo.avisos.length > 0 && (
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  Faixa larga demais em: {dados.calibracaoAlvo.avisos.map((a) => `${a.traco} (${a.tipo === 'teto' ? 'satura' : 'zera'} em ${a.pct}%)`).join(' · ')}.
                </p>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                Com faixas largas, a aderência ao cargo de destino fica alta para quase todo mundo e a diferença entre os cargos
                encolhe. Antes de decidir por estes números, vale revisar o perfil ideal de {dados.cargoAlvo} — é o gabarito que
                precisa exigir o que a gestão exige.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {dados.linhas.map((l, i) => {
              const t = tintaStatus(l);
              return (
                <GlassCard key={l.colaboradorId || `${l.nome}-${i}`}>
                  <div className="p-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs tabular-nums text-slate-500">{i + 1}</span>
                          <strong className="text-sm text-white">{l.nome}</strong>
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: t.fundo, color: t.cor }}>
                            {l.bloqueadoNoAlvo ? 'Bloqueado por requisito' : l.statusAlvoLabel}
                          </span>
                          {l.borderline && !l.bloqueadoNoAlvo && (
                            <span className="text-[10px] text-slate-500">no limite da faixa</span>
                          )}
                        </div>

                        <p className="mt-1 text-[11px] text-slate-400">
                          {dados.cargoOrigem}: <strong className="text-slate-300 tabular-nums">{fmt(l.aderenciaAtual)}</strong>
                          {'  ·  '}
                          {dados.cargoAlvo}: <strong className="tabular-nums" style={{ color: t.cor }}>{fmt(l.aderenciaAlvo)}</strong>
                        </p>

                        <Regua atual={l.aderenciaAtual} alvo={l.aderenciaAlvo} cor={t.cor} />

                        {l.bloqueadoNoAlvo && l.motivosBloqueio.length > 0 && (
                          <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] leading-relaxed text-red-300/80">
                            <ShieldAlert size={13} className="mt-px shrink-0" />
                            <span>{l.motivosBloqueio.join(' · ')}</span>
                          </p>
                        )}

                        {!l.bloqueadoNoAlvo && l.lacunas.length > 0 && (
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                            <span className="text-slate-500">A desenvolver: </span>
                            {l.lacunas.map((g) => `${g.traco} (${Math.round(g.fitPct)}%)`).join(' · ')}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-lg font-bold tabular-nums" style={{ color: t.cor }}>{fmt(l.aderenciaAlvo)}</p>
                        <p className="text-[10px] text-slate-500">aderência ao destino</p>
                        {l.delta != null && (
                          <p className="mt-1 text-[11px] tabular-nums" style={{ color: l.delta >= 0 ? '#34D399' : '#94A3B8' }}>
                            {fmtDelta(l.delta)} vs. cargo atual
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>

          {dados.linhas.length === 0 && (
            <GlassCard><p className="p-1 text-sm text-slate-300">Ninguém de {dados.cargoOrigem} pôde ser avaliado contra {dados.cargoAlvo}.</p></GlassCard>
          )}
        </>
      )}

      {!dados && !erro && !calculando && !listando && cargos.length >= 2 && (
        <GlassCard className="text-center">
          <div className="px-4 py-10">
            <TrendingUp size={26} className="mx-auto text-white/20" />
            <p className="mt-3 text-sm text-slate-300">Escolha o cargo atual e o cargo de destino para ver quem está mais próximo do perfil.</p>
          </div>
        </GlassCard>
      )}
    </>
  );
}
