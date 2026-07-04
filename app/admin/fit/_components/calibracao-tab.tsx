'use client';
/**
 * Tab "Calibração" do workspace Adequação — ferramenta DEV de Calibração,
 * AMIGÁVEL + ACIONÁVEL, fiel ao contrato:
 *  - Mudança de régua passa pelo RITO: Simular (e-se read-only, com o perigo de gate à
 *    mostra) → Aplicar (só direção limpa, só se NÃO destravar gate, com confirmação).
 *  - Recuperação de sinal monotônico (ombro/composição) é PREVIEW-ONLY → leva à mesa,
 *    não aplica por aqui (a forma certa não é one-field). Nunca auto-aplica cego.
 *  - Nunca entra no PDF do cliente.
 * Extraída da rota legada /admin/empresas/[empresaId]/calibracao (Reorganização, Fase 3);
 * as actions continuam em @/actions/calibracao — só a UI mudou de lugar.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { listarCargosCalibracao, diagnosticarCalibracao, simularMudancaRegua, aplicarMudancaRegua } from '@/actions/calibracao';

export default function CalibracaoTab({ empresaId }: { empresaId: string }) {
  const confirmDialog = useConfirm();
  const [cargos, setCargos] = useState<string[]>([]);
  const [sel, setSel] = useState('');
  const [diag, setDiag] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [detalhes, setDetalhes] = useState(false);
  const [sims, setSims] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState('');

  useEffect(() => { listarCargosCalibracao(empresaId).then((r) => setCargos(r.cargos)); }, [empresaId]);

  async function run(cargo: string) { setSel(cargo); setLoading(true); setDiag(null); setSims({}); setDiag(await diagnosticarCalibracao(empresaId, cargo)); setLoading(false); }
  function mudancaDe(l: any) { return l.quadrante === 'tensao-de-autoria' ? { tipo: 'direcao', para: 'target' } : { tipo: 'ombro' }; }
  async function simular(l: any) { setBusy('sim:' + l.key); const r = await simularMudancaRegua(empresaId, sel, l.key, mudancaDe(l) as any); setSims((s) => ({ ...s, [l.key]: r })); setBusy(''); }
  async function aplicar(l: any) {
    const ok = await confirmDialog({
      title: 'Aplicar mudança de régua',
      message: `Aplicar mudança de régua em "${l.traco}" (vira faixa-alvo, com teto)? Isto altera o scoring do cargo. Confirme só após revisar o e-se.`,
      severity: 'danger',
    });
    if (!ok) return;
    setBusy('apl:' + l.key); const r = await aplicarMudancaRegua(empresaId, sel, l.key, mudancaDe(l) as any); setBusy('');
    if (r.success) { toast.success(`Régua de "${r.alvo}" → ${r.para}. Reabrindo diagnóstico.`); run(sel); } else toast.error('Erro: ' + r.error);
  }

  const blockers = diag?.success ? diag.higiene.filter((i: any) => i.tipo !== 'sem_disc') : [];
  const flags = diag?.success ? diag.cartao.filter((l: any) => l.quadrante === 'sinal-recuperavel' || l.quadrante === 'tensao-de-autoria') : [];
  const tensao = flags.filter((l: any) => l.quadrante === 'tensao-de-autoria' && l.confianca === 'robusta');
  const veredito = blockers.length ? 'higiene' : tensao.length ? 'tensao' : flags.length ? 'sinal' : 'ok';
  const BANNER: Record<string, { cor: string; titulo: string; sub: string }> = {
    higiene: { cor: '#f59e0b', titulo: '⚠ Resolva os dados antes de confiar no diagnóstico', sub: 'Há registros duplicados/conflitantes. Limpe-os (qual fica é sua decisão) e reabra.' },
    tensao: { cor: '#f59e0b', titulo: '⚠ Uma régua parece invertida — revise antes de entregar', sub: 'Um traço marcado "mais é melhor" pontua pior nos dados. Simule e, se fizer sentido, aplique o teto.' },
    sinal: { cor: '#38bdf8', titulo: '✓ Entregável — com um sinal anotado para a mesa', sub: 'Calibração boa. Há sinal que refinaria o ranking, mas recuperá-lo é decisão clínica (não automática).' },
    ok: { cor: '#10b981', titulo: '✓ Bem calibrado', sub: 'Nenhum traço com régua problemática. Nada a ajustar aqui.' },
  };

  function frase(l: any): string {
    const m = diag.materialidade[l.key];
    if (l.quadrante === 'tensao-de-autoria') return `A régua trata "${l.traco}" como "quanto mais, melhor", mas nos dados quem tem mais pontua PIOR (ρ ${l.rho}). Provavelmente devia ter teto. Simule a correção abaixo.`;
    if (l.confianca === 'borderline') return `"${l.traco}" parece carregar sinal, mas com poucos avaliados (N=${l.n}) a evidência é fraca. Reavaliar com mais dados.`;
    return `Quem tem mais "${l.traco}" tende a ir melhor, mas a régua não distingue (quase todos no teto). Recuperar re-classificaria ~${m?.cruzam ?? '?'} pessoa(s) — mas a forma certa é composição (não um campo). Decisão de mesa, sem urgência.`;
  }

  return (
    <div className="max-w-4xl mx-auto text-slate-200">
      <h1 className="text-xl font-bold text-white">Calibração do Cargo <span className="text-slate-500 text-xs font-normal">· uso interno</span></h1>
      <p className="text-xs text-slate-400 mt-1 mb-4">Confere se a régua de um cargo mede bem. Mudanças passam pelo rito: simular (e-se) → aplicar só se não destravar gate. Não entra no relatório do cliente.</p>

      <div className="flex flex-wrap gap-2 mb-5">
        {cargos.map((c) => <button key={c} onClick={() => run(c)} className={`text-xs px-3 py-1.5 rounded border ${sel === c ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>{c}</button>)}
      </div>

      {loading && <p className="text-sm text-slate-400">Analisando…</p>}
      {diag && !diag.success && <p className="text-sm text-red-400">{diag.error}</p>}

      {diag?.success && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 border flex items-start gap-4" style={{ borderColor: BANNER[veredito].cor + '55', background: BANNER[veredito].cor + '14' }}>
            {/* Nota de saúde da régua — TRIAGEM (diz onde olhar), não grade que licencia ação */}
            {(() => {
              const s = diag.saude; const SCOR: Record<string, string> = { saudavel: '#10b981', atencao: '#f59e0b', problema: '#ef4444', indeterminado: '#64748b' };
              return (
                <div className="text-center shrink-0 w-20" title="Saúde da régua: 100 = régua correta. Penaliza só régua invertida (tensão). Indexa o cartão, não substitui.">
                  <div className="text-3xl font-bold leading-none" style={{ color: SCOR[s.status] }}>{s.nota == null ? '—' : s.nota}</div>
                  <div className="text-[9px] text-slate-400 mt-1">saúde da régua</div>
                  {s.nota != null && <div className="text-[9px]" style={{ color: s.confianca === 'baixa' ? '#f59e0b' : '#64748b' }}>conf. {s.confianca}</div>}
                </div>
              );
            })()}
            <div className="flex-1">
              <div className="font-bold text-sm" style={{ color: BANNER[veredito].cor }}>{BANNER[veredito].titulo}</div>
              <p className="text-xs text-slate-300 mt-1">{BANNER[veredito].sub}</p>
              {diag.saude.motivos.length > 0 && <ul className="text-[10px] text-slate-400 mt-2 space-y-0.5">{diag.saude.motivos.map((m: string, k: number) => <li key={k}>· {m}</li>)}</ul>}
              {diag.saude.vigiar?.length > 0 && <div className="mt-2"><div className="text-[10px] font-bold text-slate-400">Vigiar (não derruba a nota — evidência fraca):</div><ul className="text-[10px] text-slate-500 space-y-0.5">{diag.saude.vigiar.map((m: string, k: number) => <li key={k}>· {m}</li>)}</ul></div>}
            </div>
          </div>

          {blockers.length > 0 && (
            <div className="rounded-lg p-3 border border-amber-400/30 bg-amber-400/5">
              <div className="text-xs font-bold text-amber-300 mb-1">Dados a resolver</div>
              <ul className="text-xs space-y-1 text-slate-300">{blockers.map((i: any, k: number) => <li key={k}>• {i.detalhe}</li>)}</ul>
            </div>
          )}

          {flags.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Para a mesa ({flags.length})</div>
              {flags.map((l: any) => {
                const sim = sims[l.key]; const ehTensao = l.quadrante === 'tensao-de-autoria';
                return (
                  <div key={l.key} className="rounded-lg p-3 border border-white/10 bg-white/[0.02]">
                    <div className="text-sm font-medium text-white">{l.traco} <span className="text-[10px] text-slate-500">({l.confianca}{ehTensao ? ' · régua suspeita' : ' · sinal'})</span></div>
                    <p className="text-xs text-slate-300 mt-1">{frase(l)}</p>
                    <button onClick={() => simular(l)} disabled={busy === 'sim:' + l.key} className="mt-2 text-[11px] font-bold px-3 py-1 rounded border border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-50">{busy === 'sim:' + l.key ? 'Simulando…' : ehTensao ? 'Simular: aplicar teto (faixa-alvo)' : 'Simular: recuperar sinal (ombro↑)'}</button>

                    {sim && sim.success && (() => {
                      const SUG: Record<string, { cor: string; icone: string }> = { seguro: { cor: '#10b981', icone: '✓' }, opcional: { cor: '#94a3b8', icone: '○' }, cuidado: { cor: '#f59e0b', icone: '⚠' }, nao: { cor: '#ef4444', icone: '✗' } };
                      const sg = sim.sugestao; const podeAplicar = ehTensao && sg.nivel !== 'nao';
                      return (
                        <div className="mt-2 rounded bg-black/20 p-2 text-[11px] text-slate-300 space-y-1.5">
                          <div>Cor V/A/R: <span className="font-mono">{sim.dist0.v}/{sim.dist0.a}/{sim.dist0.r}</span> → <span className="font-mono">{sim.distM.v}/{sim.distM.a}/{sim.distM.r}</span> · {sim.cruzam.length} mudam de cor · Spearman {sim.spearman}</div>
                          {sim.desbloqueados.length > 0 && <div className="text-red-400">Destrava: {sim.desbloqueados.join(', ')}</div>}
                          {sim.bloqueadosNovos.length > 0 && <div className="text-amber-400/90">Bloqueia novos: {sim.bloqueadosNovos.join(', ')}</div>}
                          {/* SUGESTÃO = segurança mecânica, não o "deve" clínico */}
                          <div className="font-bold flex items-center gap-1" style={{ color: SUG[sg.nivel].cor }}>{SUG[sg.nivel].icone} Sugestão: {sg.texto}</div>
                          {!ehTensao && <div className="text-slate-500 italic">Recuperação não é mudança de um campo (composição) — só preview; leva à mesa.</div>}
                          <div className="flex items-center gap-2 pt-0.5">
                            {podeAplicar && <button onClick={() => aplicar(l)} disabled={busy === 'apl:' + l.key} className="text-[11px] font-bold px-3 py-1 rounded bg-amber-500/20 border border-amber-400 text-amber-200 hover:bg-amber-500/30 disabled:opacity-50">{busy === 'apl:' + l.key ? 'Aplicando…' : 'Aplicar mudança'}</button>}
                            <button onClick={() => setSims((s) => { const c = { ...s }; delete c[l.key]; return c; })} className="text-[11px] px-3 py-1 rounded border border-white/10 text-slate-400 hover:bg-white/5">Não aplicar</button>
                          </div>
                          {ehTensao && sg.nivel === 'nao' && <div className="text-[10px] text-red-400/80">Aplicar bloqueado: a mudança destrava gate. Decisão de mesa, não automática.</div>}
                          <div className="text-[10px] text-slate-500">A sugestão diz se é SEGURO aplicar; SE deve aplicar é decisão clínica.</div>
                        </div>
                      );
                    })()}
                    {sim && !sim.success && <div className="text-[11px] text-red-400 mt-1">{sim.error}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {veredito === 'ok' && <p className="text-xs text-emerald-400/80">Nenhum traço precisa de ajuste. Os {diag.cartao.length} traços estão calibrados ou são table-stakes do cargo.</p>}

          <button onClick={() => setDetalhes((v) => !v)} className="text-[11px] text-slate-500 hover:text-slate-300 underline">{detalhes ? 'ocultar' : 'ver'} detalhes técnicos</button>
          {detalhes && (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse mt-2">
                <thead><tr className="text-slate-500 text-left border-b border-white/10"><th className="py-1 pr-3">Traço</th><th className="pr-3">Dir</th><th className="pr-3">Sat</th><th className="pr-3">ρ</th><th className="pr-3">Conf</th><th className="pr-3">Quadrante</th></tr></thead>
                <tbody>{diag.cartao.map((l: any) => <tr key={l.key} className="border-b border-white/5"><td className="py-1 pr-3 text-white">{l.traco}</td><td className="pr-3 text-slate-400">{l.direcao}</td><td className="pr-3">{l.pctSat}%</td><td className="pr-3 font-mono">{l.rho >= 0 ? '+' : ''}{l.rho}</td><td className="pr-3">{l.confianca}</td><td className="pr-3 text-slate-400">{l.quadrante}</td></tr>)}</tbody>
              </table>
              <p className="text-[11px] text-slate-500 mt-2">Direção: {diag.direcao.gapsChecados} gaps, {diag.direcao.inconsistencias.length} inconsistências.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
