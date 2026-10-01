'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import BackButton from '@/components/back-button';
import { previaFluxoCompleto, type PreviaFluxoResult } from '@/actions/pipeline-fluxo';
import { TURMA_ENCERRADAS } from '@/lib/status';

/**
 * Fluxo completo — PRÉVIA (somente leitura). Mostra, por etapa, quem está pronto agora, quem fica pronto depois da
 * etapa anterior, quem já tem o artefato e quem está bloqueado (e por quê), com a faixa de custo medida no ledger.
 * O botão que dispara o fluxo é a etapa seguinte desta entrega; esta tela existe para decidir ANTES de gastar.
 */
const usd = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FluxoPreviaPage({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();
  const turmaId = useSearchParams().get('turma') || null;

  const [carregando, setCarregando] = useState(true);
  const [resultado, setResultado] = useState<PreviaFluxoResult | null>(null);
  const [turmas, setTurmas] = useState<any[]>([]);

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
            <h1 className="text-xl font-bold text-white">Fluxo completo · prévia</h1>
            <p className="text-[12.5px] mt-1" style={{ color: 'rgba(255,255,255,.55)' }}>
              IA4 → blueprint → auditoria → PDI → trilha → Gestor e RH. Somente leitura: nada é gerado nem gasto aqui.
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
                  Há pessoas prontas. O botão que dispara o fluxo completo é a próxima etapa desta entrega.
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
