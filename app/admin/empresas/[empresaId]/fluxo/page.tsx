'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, Loader2, Play, RefreshCw, Square, XCircle } from 'lucide-react';
import BackButton from '@/components/back-button';
import { previaFluxoCompleto, iniciarFluxoCompleto, statusFluxoCompleto, cancelarFluxoCompleto, type PreviaFluxoResult, type EstadoFluxo } from '@/actions/pipeline-fluxo';
import { TURMA_ENCERRADAS } from '@/lib/status';
import type { GravidadePrereq, IdPrereq } from '@/lib/pipeline-fluxo/prerequisitos';

/**
 * Fluxo completo — PRÉVIA (somente leitura). Mostra, por etapa, quem está pronto agora, quem fica pronto depois da
 * etapa anterior, quem já tem o artefato e quem está bloqueado (e por quê), com a faixa de custo medida no ledger.
 * Abaixo da prévia fica o painel de EXECUÇÃO: "Simular" (lê as filas e grava o que faria, sem gastar) e "Rodar fluxo
 * completo" (roda no servidor; pode fechar a aba). Enviar PDI e iniciar a cadência continuam sendo decisão do dono.
 */
const ATIVO = ['queued', 'running'];
const ESTADO_COR: Record<string, string> = { ok: '#2ECC71', parcial: '#f4b740', erro: '#e5484d', rodando: '#34c5cc', pulado: 'rgba(255,255,255,.4)', aguardando: 'rgba(255,255,255,.4)' };
const ESTADO_TXT: Record<string, string> = { ok: 'concluída', parcial: 'parcial', erro: 'com erro', rodando: 'rodando', pulado: 'pulada', aguardando: 'aguardando' };
const STATUS_TXT: Record<string, string> = { queued: 'na fila', running: 'em andamento', done: 'concluído', error: 'falhou', cancelled: 'cancelado' };

const PREREQ_COR: Record<GravidadePrereq, string> = { ok: '#2ECC71', atencao: '#f4b740', critico: '#e5484d' };
const PREREQ_ROTULO: Record<GravidadePrereq, string> = { ok: 'ok', atencao: 'atenção', critico: 'crítico' };
/** Onde resolver, quando a tela de resolução tem endereço próprio (os demais se resolvem no cadastro da empresa/pessoa). */
const PREREQ_LINK: Partial<Record<IdPrereq, { href: string; rotulo: string }>> = {
  'modulo-base': { href: '/admin/vertho/modulos-base', rotulo: 'Abrir o catálogo de módulos-base' },
};

const usd = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FluxoPreviaPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();
  const turmaId = useSearchParams().get('turma') || null;

  const [carregando, setCarregando] = useState(true);
  const [resultado, setResultado] = useState<PreviaFluxoResult | null>(null);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [fluxo, setFluxo] = useState<EstadoFluxo | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [erroExec, setErroExec] = useState<string | null>(null);

  const lerFluxo = useCallback(async () => {
    try {
      const r = await statusFluxoCompleto({ empresaId });
      if ('fluxo' in r) setFluxo(r.fluxo);
    } catch { /* polling: a próxima volta tenta de novo */ }
  }, [empresaId]);

  useEffect(() => { lerFluxo(); }, [lerFluxo]);
  const ativo = !!fluxo && ATIVO.includes(fluxo.status);
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(lerFluxo, 5000);
    return () => clearInterval(t);
  }, [ativo, lerFluxo]);

  const disparar = async (dryRun: boolean) => {
    setDisparando(true); setErroExec(null);
    try {
      const r = await iniciarFluxoCompleto({ empresaId, turmaId, dryRun });
      if ('error' in r) setErroExec(r.error);
      else { setConfirmando(false); await lerFluxo(); }
    } catch (e: any) { setErroExec(e?.message || 'Falha ao iniciar'); }
    finally { setDisparando(false); }
  };
  const cancelar = async () => {
    if (!fluxo) return;
    setDisparando(true); setErroExec(null);
    try {
      const r = await cancelarFluxoCompleto({ empresaId, jobId: fluxo.jobId });
      if ('error' in r) setErroExec(r.error);
      await lerFluxo();
    } catch (e: any) { setErroExec(e?.message || 'Falha ao cancelar'); }
    finally { setDisparando(false); }
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setResultado(await previaFluxoCompleto({ empresaId, turmaId }));
    } catch (e: any) {
      setResultado({ success: false, error: e?.message || 'Falha ao montar a prévia' });
    } finally {
      setCarregando(false);
    }
  }, [empresaId, turmaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Turmas: carregamento isolado (como na tela da empresa). Sem turmas a faixa simplesmente não aparece.
  useEffect(() => {
    (async () => {
      try {
        const { listarTurmas } = await import('@/actions/turmas');
        const r: any = await listarTurmas({ empresaId });
        if (r?.success && r.data?.turmas) setTurmas(r.data.turmas);
      } catch { /* sem turmas */ }
    })();
  }, [empresaId]);

  const turmasAtivas = turmas.filter((t: any) => !TURMA_ENCERRADAS.includes(t.status));
  // `strict: false` não estreita união por booleano: o estreitamento é por presença de campo.
  const falha = resultado && 'error' in resultado ? resultado : null;
  const sucesso = resultado && 'previa' in resultado ? resultado : null;
  const escopoObrigatorio = falha?.code === 'ESCOPO_OBRIGATORIO';

  return (
    <div className="min-h-screen" style={{ background: '#091D35' }}>
      <div className="max-w-[1100px] mx-auto px-5 py-6">
        <BackButton onClick={() => router.push(`/admin/empresas/${empresaId}`)} />

        <div className="flex items-start justify-between gap-4 mt-2 mb-5">
          <div>
            <h1 className="text-xl font-bold text-white">Fluxo completo</h1>
            <p className="text-[12.5px] mt-1" style={{ color: 'rgba(255,255,255,.55)' }}>
              IA4 → blueprint → auditoria → PDI → conteúdos → trilha → Kit → Gestor e RH. A prévia é somente leitura: nada é gerado nem gasto até você executar.
            </p>
          </div>
          <button
            onClick={carregar}
            disabled={carregando}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold disabled:opacity-50"
            style={{ background: 'rgba(52,197,204,.1)', border: '1px solid rgba(52,197,204,.3)', color: '#34c5cc' }}
          >
            {carregando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Atualizar
          </button>
        </div>

        {turmasAtivas.length > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[14px] px-4 py-3"
            style={{ background: turmaId ? 'rgba(52,197,204,.07)' : 'rgba(244,183,64,.08)', border: `1px solid ${turmaId ? 'rgba(52,197,204,.25)' : 'rgba(244,183,64,.3)'}` }}>
            <span className="text-[12px]" style={{ color: turmaId ? '#34c5cc' : '#f4b740' }}>
              {turmaId ? 'Prévia da turma escolhida.' : `Esta empresa tem ${turmasAtivas.length} turmas: escolha uma.`}
            </span>
            <select
              value={turmaId || ''}
              onChange={(e) => {
                const v = e.target.value;
                router.replace(v ? `/admin/empresas/${empresaId}/fluxo?turma=${v}` : `/admin/empresas/${empresaId}/fluxo`);
              }}
              className="rounded-lg px-2.5 py-1.5 text-[12.5px]"
              style={{ background: '#0b1a2e', border: '1px solid rgba(255,255,255,.14)', color: '#e8eef6' }}
            >
              <option value="">— sem turma escolhida —</option>
              {turmasAtivas.map((t: any) => (
                <option key={t.id} value={t.id}>{t.nome} · {t.membros ?? '?'} pessoa(s)</option>
              ))}
            </select>
          </div>
        )}

        {carregando && !resultado && (
          <div className="flex items-center gap-2 py-16 justify-center text-[13px]" style={{ color: 'rgba(255,255,255,.5)' }}>
            <Loader2 size={16} className="animate-spin" /> Lendo o estado da empresa…
          </div>
        )}

        {falha && (
          <div className="rounded-[14px] px-4 py-4 text-[13px]"
            style={{ background: 'rgba(244,183,64,.08)', border: '1px solid rgba(244,183,64,.3)', color: '#f4b740' }}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                {falha.error}
                {escopoObrigatorio && <div className="mt-1 opacity-80">Escolha a turma na faixa acima.</div>}
              </div>
            </div>
          </div>
        )}

        {sucesso && (() => {
          const p = sucesso.previa;
          const prereq = sucesso.prerequisitos;
          const criticos = prereq?.itens.filter((i) => i.gravidade === 'critico') ?? [];
          return (
            <>
              <div className="rounded-[14px] overflow-hidden mb-5" style={{ background: '#0b1d36', border: '1px solid rgba(255,255,255,.06)' }}>
                <div className="px-4 py-3 flex items-center justify-between text-[12px]" style={{ borderBottom: '1px solid rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)' }}>
                  <span><b className="text-white">{p.totalPessoas}</b> pessoa(s) no escopo</span>
                  <span>
                    Custo estimado: <b className="text-white">US$ {usd(p.custoTotalUsd.min)} a {usd(p.custoTotalUsd.max)}</b>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]" style={{ color: 'rgba(255,255,255,.85)' }}>
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,.4)' }}>
                        <th className="px-4 py-2 font-semibold">Etapa</th>
                        <th className="px-3 py-2 font-semibold text-right">Prontos agora</th>
                        <th className="px-3 py-2 font-semibold text-right">Após a etapa anterior</th>
                        <th className="px-3 py-2 font-semibold text-right">Já feitos</th>
                        <th className="px-3 py-2 font-semibold text-right">Bloqueados</th>
                        <th className="px-4 py-2 font-semibold text-right">Custo (US$)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.etapas.map((e) => (
                        <tr key={e.id} style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-white">{e.titulo}</div>
                            {e.nota && <div className="text-[11px]" style={{ color: 'rgba(255,255,255,.4)' }}>{e.nota}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono" style={{ color: e.prontosAgora ? '#2ECC71' : undefined }}>{e.prontosAgora}</td>
                          <td className="px-3 py-2.5 text-right font-mono" style={{ color: e.aposEtapaAnterior ? '#34c5cc' : undefined }}>{e.aposEtapaAnterior}</td>
                          <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'rgba(255,255,255,.5)' }}>{e.jaFeitos}</td>
                          <td className="px-3 py-2.5 text-right font-mono" style={{ color: e.bloqueados ? '#f4b740' : undefined }}>{e.bloqueados}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{e.custoUsd.max > 0 ? `${usd(e.custoUsd.min)} a ${usd(e.custoUsd.max)}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 text-[11px]" style={{ borderTop: '1px solid rgba(255,255,255,.06)', color: 'rgba(255,255,255,.4)' }}>
                  Estimativa: cada etapa real recalcula a própria fila ao rodar. "Após a etapa anterior" é projeção (por exemplo, quem responde mas ainda não foi avaliado pela IA4).
                  Custos vêm do ledger dos últimos 90 dias; a faixa alta inclui reexecuções.
                </div>
              </div>

              {p.avisos.map((a) => (
                <div key={a} className="mb-3 flex items-start gap-2 rounded-[12px] px-4 py-3 text-[12.5px]"
                  style={{ background: 'rgba(244,183,64,.08)', border: '1px solid rgba(244,183,64,.25)', color: '#f4b740' }}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {a}
                </div>
              ))}

              {p.bloqueios.length > 0 && (
                <div className="rounded-[14px] mb-5" style={{ background: '#0b1d36', border: '1px solid rgba(255,255,255,.06)' }}>
                  <div className="px-4 py-3 text-[12px] font-bold text-white" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                    O que está bloqueando, e por quê
                  </div>
                  <ul className="divide-y" style={{ borderColor: 'rgba(255,255,255,.05)' }}>
                    {p.bloqueios.map((b) => (
                      <li key={`${b.etapa}|${b.motivo}`} className="px-4 py-2.5 text-[12.5px]" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-white">{b.motivo}</span>
                          <span className="font-mono shrink-0" style={{ color: '#f4b740' }}>{b.quantidade} · {p.etapas.find((e) => e.id === b.etapa)?.titulo}</span>
                        </div>
                        <div className="text-[11.5px] mt-0.5" style={{ color: 'rgba(255,255,255,.45)' }}>
                          Ex.: {b.exemplos.join('; ')}{b.quantidade > b.exemplos.length ? '…' : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!p.nadaAFazer && (
                <div className="flex items-center gap-2 text-[12px]" style={{ color: 'rgba(255,255,255,.5)' }}>
                  <CheckCircle size={14} style={{ color: '#2ECC71' }} />
                  Há pessoas prontas para o fluxo.
                </div>
              )}

              <div className="mt-5 rounded-[14px] overflow-hidden" style={{ background: '#0b1d36', border: '1px solid rgba(255,255,255,.06)' }}>
                <div className="px-4 py-3 flex items-center justify-between gap-3 text-[12px]" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  <span className="font-bold text-white">Pré-requisitos antes de rodar</span>
                  {prereq && (
                    <span style={{ color: prereq.criticos ? '#e5484d' : prereq.atencoes ? '#f4b740' : '#2ECC71' }}>
                      {prereq.criticos ? `${prereq.criticos} crítico(s)` : ''}{prereq.criticos && prereq.atencoes ? ' · ' : ''}{prereq.atencoes ? `${prereq.atencoes} atenção` : ''}{!prereq.criticos && !prereq.atencoes ? 'tudo conferido' : ''}
                    </span>
                  )}
                </div>
                {!prereq && (
                  <div className="px-4 py-3 text-[12.5px]" style={{ color: '#f4b740' }}>
                    Não foi possível conferir os pré-requisitos{sucesso.prerequisitosErro ? `: ${sucesso.prerequisitosErro}` : '.'} O fluxo pode rodar, mas estes pontos não foram verificados.
                  </div>
                )}
                {prereq && (
                  <ul>
                    {prereq.itens.map((i) => (
                      <li key={i.id} className="px-4 py-3 text-[12.5px]" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
                        <div className="flex items-start gap-2">
                          {i.gravidade === 'ok' ? <CheckCircle size={15} className="mt-0.5 shrink-0" style={{ color: PREREQ_COR.ok }} />
                            : i.gravidade === 'critico' ? <XCircle size={15} className="mt-0.5 shrink-0" style={{ color: PREREQ_COR.critico }} />
                            : <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: PREREQ_COR.atencao }} />}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="font-semibold text-white">{i.titulo}</span>
                              <span className="text-[10.5px] uppercase tracking-wider" style={{ color: PREREQ_COR[i.gravidade] }}>{PREREQ_ROTULO[i.gravidade]}</span>
                            </div>
                            <div style={{ color: 'rgba(255,255,255,.75)' }}>{i.resumo}</div>
                            {i.exemplos.length > 0 && (
                              <div className="text-[11.5px] mt-0.5" style={{ color: 'rgba(255,255,255,.45)' }}>
                                Ex.: {i.exemplos.join('; ')}{i.quantidade > i.exemplos.length ? '…' : ''}
                              </div>
                            )}
                            {i.comoResolver && (
                              <div className="text-[11.5px] mt-1" style={{ color: PREREQ_COR[i.gravidade] }}>
                                Como resolver: {i.comoResolver}
                                {PREREQ_LINK[i.id] && <> <Link href={PREREQ_LINK[i.id]!.href} className="underline">{PREREQ_LINK[i.id]!.rotulo}</Link></>}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="px-4 py-2.5 text-[11px]" style={{ borderTop: '1px solid rgba(255,255,255,.06)', color: 'rgba(255,255,255,.4)' }}>
                  É um aviso, não um bloqueio: o fluxo roda mesmo com pendências, e só as pessoas e os cargos afetados deixam de ser atendidos. Atualize a tela depois de resolver.
                </div>
              </div>

              <div className="mt-5 rounded-[14px] px-4 py-4" style={{ background: '#0b1d36', border: '1px solid rgba(255,255,255,.06)' }}>
                <div className="text-[12px] font-bold text-white mb-1">Executar</div>
                <p className="text-[11.5px] mb-3" style={{ color: 'rgba(255,255,255,.5)' }}>
                  Roda no servidor, etapa por etapa, e você pode fechar a aba. Não envia nada às pessoas: enviar o PDI e iniciar a cadência continuam com você.
                  Gestor e RH só entram com a empresa inteira e PDI novo na rodada.
                </p>
                {!confirmando ? (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => disparar(true)} disabled={disparando || ativo || p.nadaAFazer}
                      className="rounded-lg px-3 py-2 text-[12px] font-bold disabled:opacity-40"
                      style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.18)', color: '#e8eef6' }}>
                      Simular (não gasta)
                    </button>
                    <button onClick={() => setConfirmando(true)} disabled={disparando || ativo || p.nadaAFazer}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold disabled:opacity-40"
                      style={{ background: 'rgba(52,197,204,.14)', border: '1px solid rgba(52,197,204,.4)', color: '#34c5cc' }}>
                      <Play size={13} /> Rodar fluxo completo
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg px-3 py-3 text-[12.5px]" style={{ background: 'rgba(244,183,64,.08)', border: '1px solid rgba(244,183,64,.3)', color: '#f4b740' }}>
                    Vai gastar de <b>US$ {usd(p.custoTotalUsd.min)}</b> a <b>US$ {usd(p.custoTotalUsd.max)}</b> em IA para {p.totalPessoas} pessoa(s) no escopo. Confirmar?
                    {criticos.length > 0 && (
                      <div className="mt-2 rounded-lg px-2.5 py-2 text-[12px]" style={{ background: 'rgba(229,72,77,.1)', border: '1px solid rgba(229,72,77,.35)', color: '#e5484d' }}>
                        Há {criticos.length} pré-requisito(s) crítico(s) pendente(s): {criticos.map((c) => c.titulo).join('; ')}. O que dependia deles vai falhar, e o gasto até lá não volta.
                      </div>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => disparar(false)} disabled={disparando}
                        className="rounded-lg px-3 py-1.5 text-[12px] font-bold disabled:opacity-50" style={{ background: '#f4b740', color: '#091D35' }}>
                        {disparando ? 'Enviando…' : criticos.length > 0 ? 'Rodar mesmo assim' : 'Sim, rodar'}
                      </button>
                      <button onClick={() => setConfirmando(false)} disabled={disparando}
                        className="rounded-lg px-3 py-1.5 text-[12px]" style={{ border: '1px solid rgba(255,255,255,.2)', color: '#e8eef6' }}>Voltar</button>
                    </div>
                  </div>
                )}
                {erroExec && <div className="mt-2 text-[12px]" style={{ color: '#e5484d' }}>{erroExec}</div>}
              </div>
            </>
          );
        })()}

        {fluxo && (
          <div className="mt-5 rounded-[14px] overflow-hidden" style={{ background: '#0b1d36', border: '1px solid rgba(255,255,255,.06)' }}>
            <div className="px-4 py-3 flex items-center justify-between gap-3 text-[12px]" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <span className="text-white font-bold">
                Último fluxo{fluxo.dryRun ? ' (simulação)' : ''} · {new Date(fluxo.criadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              </span>
              <span className="flex items-center gap-2">
                <span style={{ color: fluxo.status === 'done' ? '#2ECC71' : fluxo.status === 'error' ? '#e5484d' : fluxo.status === 'cancelled' ? '#f4b740' : '#34c5cc' }}>
                  {ativo && <Loader2 size={12} className="animate-spin inline mr-1" />}
                  {STATUS_TXT[fluxo.status]}
                </span>
                {ativo && (
                  <button onClick={cancelar} disabled={disparando}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-bold disabled:opacity-50"
                    style={{ border: '1px solid rgba(229,72,77,.5)', color: '#e5484d' }}>
                    <Square size={11} /> Cancelar
                  </button>
                )}
              </span>
            </div>
            {fluxo.progresso && (
              <>
                <div className="px-4 py-2 text-[12px]" style={{ color: 'rgba(255,255,255,.6)' }}>{fluxo.progresso.atual}</div>
                <ul>
                  {fluxo.progresso.etapas.map((e) => (
                    <li key={e.id} className="px-4 py-2 text-[12.5px] flex items-baseline justify-between gap-3" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
                      <span className="text-white">{e.titulo}{e.detalhe && <span className="ml-2 text-[11px]" style={{ color: 'rgba(255,255,255,.45)' }}>{e.detalhe}</span>}</span>
                      <span className="font-mono shrink-0" style={{ color: ESTADO_COR[e.estado] }}>
                        {ESTADO_TXT[e.estado]}{e.total > 0 && e.estado !== 'pulado' ? ` · ${e.feitos}/${e.total}${e.falhas ? ` · ${e.falhas} falha(s)` : ''}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                {fluxo.progresso.modelos && (
                  <div className="px-4 py-2 text-[11px]" style={{ borderTop: '1px solid rgba(255,255,255,.06)', color: 'rgba(255,255,255,.4)' }}>
                    Modelos: {Object.entries(fluxo.progresso.modelos).map(([k, v]) => `${k} ${v}`).join(' · ')}
                  </div>
                )}
                {fluxo.progresso.resumo && (
                  <div className="px-4 py-2.5 text-[11.5px]" style={{ borderTop: '1px solid rgba(255,255,255,.06)', color: 'rgba(255,255,255,.6)' }}>{fluxo.progresso.resumo}</div>
                )}
              </>
            )}
            {fluxo.erro && <div className="px-4 py-2.5 text-[12px]" style={{ borderTop: '1px solid rgba(255,255,255,.06)', color: '#e5484d' }}>{fluxo.erro}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
