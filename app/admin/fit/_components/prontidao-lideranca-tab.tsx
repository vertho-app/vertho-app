'use client';
/**
 * Aba "Prontidão" do workspace Adequação (admin) — três lentes:
 *   configuração → o programa (cargo-alvo, população, exemplares, corte);
 *   prévia       → a MESMA leitura que o RH vê, com as actions de admin;
 *   calibragem   → onde o instrumento coloca os líderes de referência.
 *
 * A Vertho opera, o cliente consome (§26): tudo que escreve mora aqui, no
 * admin; o RH só lê.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Power, RefreshCw, Star, AlertTriangle } from 'lucide-react';
import ProntidaoLiderancaView from '@/components/prontidao-lideranca-view';
import {
  getConfigProntidaoAdmin, salvarConfigProntidaoAdmin, setModuloProntidaoAdmin,
  getProntidaoLiderancaAdmin, getParecerLiderancaAdmin, getCalibragemAdmin,
  exportarParecerPDFAdmin, exportarConsolidadoPDFAdmin,
} from '@/actions/prontidao-lideranca';
import { DEFAULTS_PRONTIDAO, EXEMPLARES_MAX, EXEMPLARES_MIN } from '@/lib/prontidao-lideranca/config';

type Sub = 'config' | 'previa' | 'calibragem';
const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toFixed(2).replace('.', ','));

export default function ProntidaoLiderancaTab({ empresaId }: { empresaId: string }) {
  const [sub, setSub] = useState<Sub>('config');
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    cargo_alvo: '', exemplares: [] as string[], escopoTipo: 'empresa_inteira' as 'empresa_inteira' | 'turma', turmaId: '',
    um_por_dia: DEFAULTS_PRONTIDAO.um_por_dia as boolean, corte_nota: DEFAULTS_PRONTIDAO.corte_nota as number, banda: DEFAULTS_PRONTIDAO.banda as number,
  });
  const [salvando, setSalvando] = useState(false);
  const [alternando, setAlternando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [versao, setVersao] = useState(0);
  const [calib, setCalib] = useState<any>(null);
  const [calibLoading, setCalibLoading] = useState(false);

  const recarregar = useCallback(async () => {
    setLoading(true);
    const r: any = await getConfigProntidaoAdmin(empresaId);
    if (r.success) {
      setInfo(r);
      if (r.cfg) {
        setForm({
          cargo_alvo: r.cfg.cargo_alvo, exemplares: r.cfg.exemplares,
          escopoTipo: r.cfg.escopo.tipo, turmaId: r.cfg.escopo.tipo === 'turma' ? r.cfg.escopo.turmaId : '',
          um_por_dia: r.cfg.um_por_dia, corte_nota: r.cfg.corte_nota, banda: r.cfg.banda,
        });
      }
      setErros(r.validacao?.erros || []);
      setAvisos(r.validacao?.avisos || []);
    } else toast.error(r.error || 'Erro ao carregar.');
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  async function alternarModulo() {
    if (!info) return;
    setAlternando(true);
    const r: any = await setModuloProntidaoAdmin(empresaId, !info.contratado);
    if (r.success) { toast.success(r.contratado ? 'Módulo ligado.' : 'Módulo desligado.'); await recarregar(); setVersao((v) => v + 1); }
    else toast.error(r.error || 'Erro.');
    setAlternando(false);
  }

  async function salvar() {
    setSalvando(true); setErros([]); setAvisos([]);
    const r: any = await salvarConfigProntidaoAdmin(empresaId, {
      cargo_alvo: form.cargo_alvo, exemplares: form.exemplares,
      escopo: form.escopoTipo === 'turma' ? { tipo: 'turma', turmaId: form.turmaId } : { tipo: 'empresa_inteira' },
      um_por_dia: form.um_por_dia, corte_nota: Number(form.corte_nota), banda: Number(form.banda),
    });
    if (r.success) { toast.success('Programa salvo.'); setAvisos(r.avisos || []); setVersao((v) => v + 1); await recarregar(); }
    else { setErros(r.erros || [r.error]); setAvisos(r.avisos || []); toast.error(r.error || 'Configuração inválida.'); }
    setSalvando(false);
  }

  async function calcularCalibragem() {
    setCalibLoading(true); setCalib(null);
    const r: any = await getCalibragemAdmin(empresaId);
    if (r.success) setCalib(r.data); else toast.error(r.error || 'Erro.');
    setCalibLoading(false);
  }

  const pessoasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = (info?.pessoas || []) as { id: string; nome: string; cargo: string | null }[];
    return (q ? lista.filter((p) => p.nome.toLowerCase().includes(q) || (p.cargo || '').toLowerCase().includes(q)) : lista).slice(0, 40);
  }, [info, busca]);

  function toggleExemplar(id: string) {
    setForm((f) => ({ ...f, exemplares: f.exemplares.includes(id) ? f.exemplares.filter((x) => x !== id) : [...f.exemplares, id] }));
  }

  if (loading && !info) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>;
  if (!info) return null;

  const inputCls = 'w-full px-3 py-2 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40';
  const bg = { background: '#091D35' } as const;

  return (
    <div className="space-y-4">
      {/* Cabeçalho: estado do módulo */}
      <div className="rounded-xl p-4 border border-white/[0.06] flex flex-wrap items-center justify-between gap-3" style={{ background: '#0F2A4A' }}>
        <div>
          <p className="text-sm font-bold text-white">Módulo Prontidão para Liderança</p>
          <p className="text-[11px] text-gray-400">{info.contratado ? 'Contratado — o RH vê a leitura e o menu; o trilho de liderança abre para a população.' : 'Não contratado — nada aparece para o cliente nem para os participantes.'}</p>
        </div>
        <button type="button" onClick={alternarModulo} disabled={alternando}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold border transition disabled:opacity-50 ${info.contratado ? 'border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10' : 'border-white/10 text-gray-300 hover:bg-white/5'}`}>
          {alternando ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />} {info.contratado ? 'Ligado' : 'Desligado'}
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl border border-white/[0.06]" style={bg}>
        {([['config', 'Configuração'], ['previa', 'Prévia da leitura'], ['calibragem', 'Calibragem']] as [Sub, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setSub(k)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${sub === k ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:text-gray-300'}`}>{label}</button>
        ))}
      </div>

      {sub === 'config' && (
        <div className="rounded-xl p-4 border border-white/[0.06] space-y-4" style={{ background: '#0F2A4A' }}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Cargo-alvo (perfil de liderança)</span>
              <select value={form.cargo_alvo} onChange={(e) => setForm((f) => ({ ...f, cargo_alvo: e.target.value }))} className={inputCls} style={bg}>
                <option value="">— escolha —</option>
                {(info.cargos || []).map((c: any) => (
                  <option key={c.nome} value={c.nome}>{c.nome} · {c.temGabarito ? 'gabarito' : 'SEM gabarito'} · Top {c.top5.length}</option>
                ))}
              </select>
              <span className="block mt-1 text-[10px] text-gray-500">As competências do mapeamento são o Top 5 deste cargo — as mesmas que geram os cenários.</span>
            </label>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">População</span>
              <div className="mt-1 flex gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-300"><input type="radio" checked={form.escopoTipo === 'empresa_inteira'} onChange={() => setForm((f) => ({ ...f, escopoTipo: 'empresa_inteira' }))} /> empresa inteira</label>
                <label className="flex items-center gap-1.5 text-xs text-gray-300"><input type="radio" checked={form.escopoTipo === 'turma'} onChange={() => setForm((f) => ({ ...f, escopoTipo: 'turma' }))} /> uma turma</label>
              </div>
              {form.escopoTipo === 'turma' && (
                <select value={form.turmaId} onChange={(e) => setForm((f) => ({ ...f, turmaId: e.target.value }))} className={`${inputCls} mt-2`} style={bg}>
                  <option value="">— turma —</option>
                  {(info.turmas || []).map((t: any) => <option key={t.id} value={t.id}>{t.nome} ({t.status})</option>)}
                </select>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={form.um_por_dia} onChange={(e) => setForm((f) => ({ ...f, um_por_dia: e.target.checked }))} /> um cenário por dia (só no trilho de liderança)</label>
            <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Corte (1–4)</span><input type="number" step="0.05" min={1} max={4} value={form.corte_nota} onChange={(e) => setForm((f) => ({ ...f, corte_nota: Number(e.target.value) }))} className={inputCls} style={bg} /></label>
            <label className="block"><span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Banda de revisão (±)</span><input type="number" step="0.01" min={0} max={1} value={form.banda} onChange={(e) => setForm((f) => ({ ...f, banda: Number(e.target.value) }))} className={inputCls} style={bg} /><span className="block mt-1 text-[10px] text-gray-500">0,33 é emprestado do instrumento de conversa; a aferição substitui.</span></label>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Líderes de referência ({form.exemplares.length}) · o escopo prevê {EXEMPLARES_MIN} a {EXEMPLARES_MAX}</span>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="buscar pessoa…" className="px-2 py-1 rounded-md text-xs text-white border border-white/10 outline-none" style={bg} />
            </div>
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-white/[0.06] divide-y divide-white/[0.04]" style={bg}>
              {pessoasFiltradas.map((p) => (
                <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-200 hover:bg-white/[0.03] cursor-pointer">
                  <input type="checkbox" checked={form.exemplares.includes(p.id)} onChange={() => toggleExemplar(p.id)} />
                  {form.exemplares.includes(p.id) && <Star size={10} className="text-amber-300" />}
                  <span>{p.nome}</span><span className="text-gray-500">· {p.cargo || '—'}</span>
                </label>
              ))}
              {!pessoasFiltradas.length && <p className="px-3 py-2 text-xs text-gray-500">ninguém encontrado</p>}
            </div>
            <p className="mt-1 text-[10px] text-gray-500">Eles respondem o instrumento ANTES da turma. A calibragem mostra onde a régua os coloca; o conserto é no texto do descritor, nunca no prompt.</p>
          </div>

          {erros.length > 0 && <div className="rounded-lg border border-red-400/30 bg-red-400/5 p-3 space-y-1">{erros.map((e) => <p key={e} className="text-[11px] text-red-200 flex gap-1.5"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {e}</p>)}</div>}
          {avisos.length > 0 && <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 space-y-1">{avisos.map((a) => <p key={a} className="text-[11px] text-amber-200">{a}</p>)}</div>}

          <div className="flex justify-end">
            <button type="button" onClick={salvar} disabled={salvando || !form.cargo_alvo}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-[#0C1829] bg-gradient-to-br from-cyan-400 to-cyan-600 hover:brightness-110 disabled:opacity-50">
              {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar programa
            </button>
          </div>
        </div>
      )}

      {sub === 'previa' && (
        <ProntidaoLiderancaView
          scopeKey={`${empresaId}:${versao}`}
          carregar={() => getProntidaoLiderancaAdmin(empresaId)}
          parecer={(id) => getParecerLiderancaAdmin(empresaId, id)}
          exportarParecer={(id) => exportarParecerPDFAdmin(empresaId, id)}
          exportarConsolidado={() => exportarConsolidadoPDFAdmin(empresaId)}
        />
      )}

      {sub === 'calibragem' && (
        <div className="rounded-xl p-4 border border-white/[0.06] space-y-3" style={{ background: '#0F2A4A' }}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">Onde o instrumento coloca os líderes de referência. Descritor em que um exemplar ficou abaixo do corte é suspeita de rubrica — revise o texto de N3/N4 e reavalie.</p>
            <button type="button" onClick={calcularCalibragem} disabled={calibLoading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-gray-200 hover:bg-white/5 disabled:opacity-50">
              {calibLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Calcular
            </button>
          </div>
          {calib && (
            <>
              <p className="text-xs text-gray-300">{calib.exemplares} exemplar(es) · {calib.comMapeamentoCompleto} com mapeamento completo · corte {fmt(calib.corte)}</p>
              {calib.avisos?.length > 0 && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 space-y-1">
                  {calib.avisos.map((a: string) => <p key={a} className="text-[11px] text-amber-200 flex items-start gap-1.5"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {a}</p>)}
                </div>
              )}
              {calib.pendentes.length > 0 && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-[11px] text-amber-200">
                  Pendentes: {calib.pendentes.map((p: any) => `${p.nome || p.colaboradorId} (faltam ${p.faltantes.join(', ')})`).join(' · ')}
                </div>
              )}
              <div className="rounded-lg border border-white/[0.06] overflow-hidden" style={bg}>
                {/* `n de N` é o denominador: "2 abaixo" significa coisas opostas com 2 ou 30 exemplares avaliados. */}
                <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 px-3 py-2 text-[10px] font-extrabold uppercase tracking-widest text-gray-500 border-b border-white/[0.06]"><span>Competência</span><span>Descritor</span><span>Abaixo do corte</span><span>Média</span></div>
                {calib.descritoresParaRevisar.map((d: any) => (
                  <div key={`${d.competencia}|${d.descritor}`} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 px-3 py-2 text-xs border-b border-white/[0.04] last:border-b-0">
                    <span className="text-gray-300">{d.competencia}</span>
                    <span className="text-white">{d.descritor}</span>
                    <span className="text-red-300">
                      <b>{d.abaixoDoCorte.length} de {d.avaliados}</b> · {d.abaixoDoCorte.map((e: any) => `${e.nome || '?'} ${fmt(e.nota)}`).join(', ')}
                    </span>
                    <span className="tabular-nums text-gray-400 text-right">{fmt(d.media)}</span>
                  </div>
                ))}
                {!calib.descritoresParaRevisar.length && <p className="px-3 py-3 text-xs text-gray-400">Nenhum descritor com exemplar abaixo do corte{calib.todos.length ? '' : ' — ainda sem notas dos exemplares'}.</p>}
              </div>
              {calib.todos.length > 0 && (
                <details className="text-xs text-gray-400"><summary className="cursor-pointer">Todos os descritores ({calib.todos.length})</summary>
                  <ul className="mt-2 space-y-0.5">{calib.todos.map((d: any) => <li key={`${d.competencia}|${d.descritor}`}>{d.competencia} · {d.descritor} · média {fmt(d.media)} · {d.avaliados} exemplar(es)</li>)}</ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
