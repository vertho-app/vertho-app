'use client';
/**
 * Tela DEV de Diagnóstico de Calibração. AMIGÁVEL + ACIONÁVEL, mas fiel ao contrato:
 *  - Ação MECÂNICA/segura tem botão (gerar relatório — o passo real após calibrar).
 *  - Decisão CLÍNICA de régua (recuperar sinal / consertar tensão) vai pra MESA em
 *    linguagem clara, NUNCA vira botão de auto-aplicar (provamos que "faixa-alvo
 *    genérico" está errado p/ traço monotônico). DESCREVE, sugere o próximo passo
 *    seguro, e marca o que é juízo humano. Nunca entra no PDF do cliente.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { listarCargosCalibracao, diagnosticarCalibracao } from '@/actions/calibracao';
import { gerarRelatorioAdequacao } from '@/actions/adequacao-cargo';

export default function CalibracaoPage() {
  const { empresaId } = useParams() as { empresaId: string };
  const [cargos, setCargos] = useState<string[]>([]);
  const [sel, setSel] = useState('');
  const [diag, setDiag] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [detalhes, setDetalhes] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [pdf, setPdf] = useState<{ url?: string; error?: string } | null>(null);

  useEffect(() => { listarCargosCalibracao(empresaId).then((r) => setCargos(r.cargos)); }, [empresaId]);

  async function run(cargo: string) {
    setSel(cargo); setLoading(true); setDiag(null); setPdf(null);
    setDiag(await diagnosticarCalibracao(empresaId, cargo)); setLoading(false);
  }
  async function gerar() {
    setGerando(true); setPdf(null);
    const r = await gerarRelatorioAdequacao(empresaId, sel, { comAnaliseIA: true });
    setPdf(r.success ? { url: r.url } : { error: r.error }); setGerando(false);
  }

  // ── veredito (1 frase) + ação primária segura ──────────────────────────────
  const blockers = diag?.success ? diag.higiene.filter((i: any) => i.tipo !== 'sem_disc') : [];
  const flags = diag?.success ? diag.cartao.filter((l: any) => l.quadrante === 'sinal-recuperavel' || l.quadrante === 'tensao-de-autoria') : [];
  const tensao = flags.filter((l: any) => l.quadrante === 'tensao-de-autoria' && l.confianca === 'robusta');
  const veredito: 'higiene' | 'tensao' | 'sinal' | 'ok' =
    blockers.length ? 'higiene' : tensao.length ? 'tensao' : flags.length ? 'sinal' : 'ok';
  const BANNER: Record<string, { cor: string; bg: string; titulo: string; sub: string }> = {
    higiene: { cor: '#f59e0b', bg: 'rgba(245,158,11,0.1)', titulo: '⚠ Resolva os dados antes de entregar', sub: 'Há registros duplicados/conflitantes que contaminam o diagnóstico. Limpe-os primeiro.' },
    tensao: { cor: '#f59e0b', bg: 'rgba(245,158,11,0.1)', titulo: '⚠ Um traço merece revisão clínica antes de confiar no ranking', sub: 'A régua de um traço parece invertida (mais pontua pior). Veja abaixo e leve à mesa.' },
    sinal: { cor: '#38bdf8', bg: 'rgba(56,189,248,0.08)', titulo: '✓ Cargo entregável — com um sinal anotado para a mesa', sub: 'A calibração está boa para entregar. Há sinal que poderia refinar o ranking, mas é decisão clínica, sem urgência.' },
    ok: { cor: '#10b981', bg: 'rgba(16,185,129,0.08)', titulo: '✓ Cargo bem calibrado — pode gerar e entregar', sub: 'Nenhum traço com problema de régua. O relatório deste cargo está pronto para sair.' },
  };

  function frase(l: any): string {
    const m = diag.materialidade[l.key];
    const reclass = m ? `re-classificaria ~${m.cruzam} pessoa(s) (${m.detalhe.map((d: any) => `${d.de}→${d.para}`).join(', ') || 'dentro do recomendado'})` : '';
    if (l.quadrante === 'tensao-de-autoria')
      return `A régua trata "${l.traco}" como "quanto mais, melhor", mas nos dados quem tem mais pontua PIOR (ρ ${l.rho}). Pode ser que devesse ter teto (curvilínea). Decisão da mesa clínica — não mexa sem o psicólogo.`;
    if (l.confianca === 'borderline')
      return `"${l.traco}" parece carregar sinal, mas com poucos avaliados (N=${l.n}) a evidência é fraca. Reavaliar com mais dados antes de qualquer mudança.`;
    return `Quem tem mais "${l.traco}" tende a ir melhor no cargo, mas a régua atual não distingue (quase todos pontuam no teto). Recuperar esse sinal ${reclass} — mas é decisão clínica (a forma certa não é automática). Vale a mesa quando houver um 2º grupo deste cargo.`;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto text-slate-200">
      <h1 className="text-xl font-bold text-white">Calibração do Cargo <span className="text-slate-500 text-xs font-normal">· uso interno</span></h1>
      <p className="text-xs text-slate-400 mt-1 mb-4">Confere se a régua de um cargo está medindo bem antes de você entregar o relatório. Sugere o próximo passo; mudanças de régua continuam decisão clínica.</p>

      <div className="flex flex-wrap gap-2 mb-5">
        {cargos.map((c) => (
          <button key={c} onClick={() => run(c)} className={`text-xs px-3 py-1.5 rounded border ${sel === c ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>{c}</button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-400">Analisando…</p>}
      {diag && !diag.success && <p className="text-sm text-red-400">{diag.error}</p>}

      {diag?.success && (
        <div className="space-y-4">
          {/* VEREDITO + AÇÃO */}
          <div className="rounded-xl p-4 border" style={{ borderColor: BANNER[veredito].cor + '55', background: BANNER[veredito].bg }}>
            <div className="font-bold text-white text-sm" style={{ color: BANNER[veredito].cor }}>{BANNER[veredito].titulo}</div>
            <p className="text-xs text-slate-300 mt-1">{BANNER[veredito].sub}</p>
            <div className="mt-3 flex items-center gap-3">
              {veredito === 'higiene'
                ? <span className="text-xs text-amber-400">Resolva os itens abaixo (decisão de qual registro fica é sua) e reabra a tela.</span>
                : <button onClick={gerar} disabled={gerando} className="text-xs font-bold px-4 py-2 rounded bg-emerald-500/20 border border-emerald-400 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50">{gerando ? 'Gerando…' : 'Gerar relatório de Adequação'}</button>}
              {pdf?.url && <a href={pdf.url} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 underline">Abrir PDF gerado ↗</a>}
              {pdf?.error && <span className="text-xs text-red-400">{pdf.error}</span>}
            </div>
          </div>

          {/* HIGIENE (só blockers) */}
          {blockers.length > 0 && (
            <div className="rounded-lg p-3 border border-amber-400/30 bg-amber-400/5">
              <div className="text-xs font-bold text-amber-300 mb-1">Dados a resolver</div>
              <ul className="text-xs space-y-1 text-slate-300">{blockers.map((i: any, k: number) => <li key={k}>• {i.detalhe}</li>)}</ul>
            </div>
          )}

          {/* TRAÇOS QUE PEDEM A MESA (linguagem clara) */}
          {flags.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Para a mesa clínica ({flags.length})</div>
              {flags.map((l: any) => (
                <div key={l.key} className="rounded-lg p-3 border border-white/10 bg-white/[0.02]">
                  <div className="text-sm font-medium text-white">{l.traco} <span className="text-[10px] text-slate-500">({l.confianca})</span></div>
                  <p className="text-xs text-slate-300 mt-1">{frase(l)}</p>
                </div>
              ))}
            </div>
          )}

          {veredito === 'ok' && <p className="text-xs text-emerald-400/80">Nenhum traço precisa da mesa. Os {diag.cartao.length} traços estão calibrados ou são table-stakes esperados do cargo.</p>}

          {/* DETALHES TÉCNICOS (recolhido) */}
          <button onClick={() => setDetalhes((v) => !v)} className="text-[11px] text-slate-500 hover:text-slate-300 underline">{detalhes ? 'ocultar' : 'ver'} detalhes técnicos (ρ, saturação, materialidade)</button>
          {detalhes && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse mt-2">
                <thead><tr className="text-slate-500 text-left border-b border-white/10"><th className="py-1 pr-3">Traço</th><th className="pr-3">Dir</th><th className="pr-3">Sat</th><th className="pr-3">ρ</th><th className="pr-3">Conf</th><th className="pr-3">Quadrante</th><th className="pr-3">Materialid.</th></tr></thead>
                <tbody>
                  {diag.cartao.map((l: any) => { const m = diag.materialidade[l.key]; return (
                    <tr key={l.key} className="border-b border-white/5"><td className="py-1 pr-3 text-white">{l.traco}</td><td className="pr-3 text-slate-400">{l.direcao}</td><td className="pr-3">{l.pctSat}%</td><td className="pr-3 font-mono">{l.rho >= 0 ? '+' : ''}{l.rho}</td><td className="pr-3">{l.confianca}</td><td className="pr-3 text-slate-400">{l.quadrante}</td><td className="pr-3 text-slate-400">{m ? `${m.cruzam}/${m.naoBloqueados}` : '—'}</td></tr>
                  ); })}
                </tbody>
              </table>
              <p className="text-[11px] text-slate-500 mt-2">Direção do desvio: {diag.direcao.gapsChecados} gaps checados, {diag.direcao.inconsistencias.length} inconsistências.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
