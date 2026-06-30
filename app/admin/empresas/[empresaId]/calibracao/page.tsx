'use client';
/**
 * Tela DEV de Diagnóstico de Calibração (Fase 1). Instrumentação INTERNA de autoria —
 * NUNCA entra no PDF do cliente. DESCREVE e CLASSIFICA (quadrante + |ρ|/crít + confiança +
 * materialidade simulada); NÃO prescreve ação. A decisão continua humana.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { listarCargosCalibracao, diagnosticarCalibracao } from '@/actions/calibracao';

const QUAD: Record<string, { label: string; cor: string }> = {
  'tensao-de-autoria': { label: 'Tensão de autoria', cor: '#f59e0b' },
  'sinal-recuperavel': { label: 'Sinal recuperável', cor: '#10b981' },
  'curvilineo-correto': { label: 'Curvilíneo-correto', cor: '#38bdf8' },
  'design-by-choice': { label: 'Design-by-choice', cor: '#64748b' },
};

export default function CalibracaoPage() {
  const { empresaId } = useParams() as { empresaId: string };
  const [cargos, setCargos] = useState<string[]>([]);
  const [sel, setSel] = useState('');
  const [diag, setDiag] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { listarCargosCalibracao(empresaId).then((r) => setCargos(r.cargos)); }, [empresaId]);

  async function run(cargo: string) {
    setSel(cargo); setLoading(true); setDiag(null);
    setDiag(await diagnosticarCalibracao(empresaId, cargo)); setLoading(false);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto text-slate-200">
      <h1 className="text-xl font-bold text-white">Diagnóstico de Calibração <span className="text-amber-400 text-xs font-normal">· interno / dev-only</span></h1>
      <p className="text-xs text-slate-400 mt-1 mb-4">Descreve e classifica a calibração de um cargo (saturação, ρ, confiança, materialidade). <b>Não prescreve ação</b> e <b>nunca entra no relatório do cliente</b> — a decisão de forma de régua é humana.</p>

      <div className="flex flex-wrap gap-2 mb-5">
        {cargos.map((c) => (
          <button key={c} onClick={() => run(c)} className={`text-xs px-3 py-1.5 rounded border ${sel === c ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>{c}</button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-400">Diagnosticando…</p>}
      {diag && !diag.success && <p className="text-sm text-red-400">{diag.error}</p>}

      {diag?.success && (
        <div className="space-y-6">
          {/* CAMADA 0 — higiene */}
          <section>
            {(() => {
              const semDisc = diag.higiene.filter((i: any) => i.tipo === 'sem_disc');
              const blockers = diag.higiene.filter((i: any) => i.tipo !== 'sem_disc'); // dedup/email/conflito = contaminam
              return (<>
                <h2 className="text-sm font-bold text-white mb-2">Camada 0 — Higiene de pool {blockers.length > 0 ? <span className="text-amber-400">({blockers.length} a resolver — dedup humano antes de oficializar)</span> : <span className="text-emerald-400">(sem contaminação)</span>}</h2>
                {semDisc.length > 0 && <p className="text-xs text-slate-500 mb-1">{semDisc.length} colaborador(es) sem DISC — não avaliados, excluídos do score (informativo, não bloqueia).</p>}
                {blockers.length > 0 && (
                  <ul className="text-xs space-y-1">
                    {blockers.map((i: any, k: number) => (
                      <li key={k} className="text-slate-300"><span className="text-amber-400 font-mono">[{i.tipo}]</span> {i.detalhe}</li>
                    ))}
                  </ul>
                )}
              </>);
            })()}
          </section>

          {/* CAMADA 1 — cartão */}
          <section>
            <h2 className="text-sm font-bold text-white mb-2">Cartão de Calibração — N={diag.n} não-bloqueados</h2>
            {diag.semTracos && <p className="text-xs text-amber-400">Snapshot sem detalhe por-traço (gerado antes do enriquecimento). Regere o relatório.</p>}
            <table className="w-full text-xs border-collapse">
              <thead><tr className="text-slate-400 text-left border-b border-white/10">
                <th className="py-1.5 pr-3">Traço</th><th className="pr-3">Direção</th><th className="pr-3">Saturação</th><th className="pr-3">ρ (bruto×Beta)</th><th className="pr-3">Confiança</th><th className="pr-3">Quadrante</th><th className="pr-3">Materialidade (sim.)</th>
              </tr></thead>
              <tbody>
                {diag.cartao.map((l: any) => {
                  const m = diag.materialidade[l.key];
                  return (
                    <tr key={l.key} className="border-b border-white/5 align-top">
                      <td className="py-1.5 pr-3 text-white font-medium">{l.traco}</td>
                      <td className="pr-3 text-slate-400">{l.direcao}</td>
                      <td className="pr-3">{l.ladoSaturacao} {l.pctSat}%</td>
                      <td className="pr-3 font-mono">{l.rho >= 0 ? '+' : ''}{l.rho}</td>
                      <td className="pr-3">{l.confianca === 'ns' ? <span className="text-slate-500">não-sig</span> : <span className={l.confianca === 'robusta' ? 'text-emerald-400' : 'text-amber-400'}>{l.confianca}</span>}</td>
                      <td className="pr-3"><span style={{ color: QUAD[l.quadrante]?.cor }}>{QUAD[l.quadrante]?.label}</span></td>
                      <td className="pr-3 text-slate-300">{m ? <span title="what-if rotulado — não é o resultado entregue">{m.cruzam}/{m.naoBloqueados} cruzam cor <span className="text-slate-500">(ombro {m.ombroBase}→{m.ombroRecuperado})</span></span> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* decisões pendentes (texto = a pergunta, não a prescrição) */}
            {diag.cartao.filter((l: any) => l.decisaoPendente).map((l: any) => (
              <p key={l.key} className="text-[11px] text-slate-400 mt-2"><b className="text-slate-300">{l.traco}:</b> {l.decisaoPendente}</p>
            ))}
          </section>

          {/* DIREÇÃO — consistency-check */}
          <section>
            <h2 className="text-sm font-bold text-white mb-1">Direção do desvio — {diag.direcao.gapsChecados} gaps checados</h2>
            {diag.direcao.inconsistencias.length === 0
              ? <p className="text-xs text-emerald-400">0 inconsistências (lado narrado bate com bruto×faixa).</p>
              : <ul className="text-xs text-red-400 space-y-0.5">{diag.direcao.inconsistencias.map((x: any, k: number) => <li key={k}>{x.nome} · {x.traco} bruto {x.bruto} faixa {x.faixa}: gravado {x.ladoGravado}, esperado {x.ladoEsperado}</li>)}</ul>}
          </section>
        </div>
      )}
    </div>
  );
}
