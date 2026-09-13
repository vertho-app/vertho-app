'use client';
import type { Saidas } from '@/lib/simulador-vendas/schema';
const pilares = [ ['P', 'Preparação', 'Preparacao'], ['A', 'Análise', 'Analise'], ['C', 'Cocriação', 'Cocriacao'], ['E', 'Engajamento', 'Engajamento'] ] as const;
const resultados = { fechou_ideal: 'Fechou no ideal', fechou_aceitavel: 'Fechou no aceitável', nao_fechou: 'Não fechou', inconclusivo: 'Resultado inconclusivo' };
export default function Relatorio({ relatorio: r }: { relatorio: Saidas['gerente'] }) {
  return <section aria-label="Relatório PACE">
    <div className="flex items-baseline justify-between gap-4 mb-4"><h2 className="text-xl">Sua devolutiva PACE</h2><span className="text-3xl tabular-nums">{r.Media.toLocaleString('pt-BR')}<small className="text-sm text-slate-400"> / 10</small></span></div>
    <p className="text-sm text-slate-300 leading-relaxed mb-5">{r.Resumo}</p>
    <div className="grid sm:grid-cols-2 gap-3">{pilares.map(([p, nome, detalhe]) => <article key={p} className="border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{nome}</h3><span className="tabular-nums text-cyan-300">{r[p].toLocaleString('pt-BR')}</span></div>
      <meter className="w-full my-2" min={0} max={10} value={r[p]} aria-label={`Nota de ${nome}`}/><p className="text-sm text-slate-300 leading-relaxed">{r[detalhe]}</p>
    </article>)}</div>
    <h3 className="font-semibold mt-6 mb-2">Para a próxima conversa</h3>
    <ol className="space-y-3 list-decimal pl-5">{r.Recomendacoes.map((item, i) => <li key={i} className="text-sm text-slate-300"><strong className="text-white">{item.titulo}</strong><p>{item.descricao}</p></li>)}</ol>
    <div className="mt-6 border-t border-white/10 pt-4 text-sm text-slate-300"><p className="font-semibold text-white">{resultados[r.Resultado]}</p>{r.Preco_final && <p>{r.Preco_final}</p>}{r.Compromissos_obtidos && <p className="mt-1">{r.Compromissos_obtidos}</p>}</div>
    {[...r.Beneficios_ocultos_descobertos, ...r.Objecoes_profundas_descobertas].length > 0 && <details className="mt-5 text-sm"><summary className="cursor-pointer">Descobertas na conversa</summary><ul className="mt-3 space-y-3">{[...r.Beneficios_ocultos_descobertos, ...r.Objecoes_profundas_descobertas].map((d, i) => <li key={i}><p>{d.nome} · turno {d.turno}</p><blockquote className="border-l-2 border-cyan-400 pl-3 mt-1 text-slate-300">{d.citacao_vendedor}</blockquote></li>)}</ul></details>}
    {r.Violacoes.length > 0 && <details className="mt-4 text-sm"><summary className="cursor-pointer">Registros de conduta</summary>{r.Violacoes.map((v, i) => <p key={i} className="mt-2 text-amber-200">Turno {v.turno} · {v.motivo}</p>)}</details>}
    <p className="text-xs text-slate-400 mt-6">Avaliação de uma situação simulada. As notas PACE não alteram automaticamente o seu PDI ou as avaliações de competências da Vertho.</p>
  </section>;
}
