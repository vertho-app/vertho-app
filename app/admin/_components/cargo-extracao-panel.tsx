'use client';
/**
 * Tela de REVISÃO da Fase 0 — DOCUMENTO-PRIMEIRO + preenchimento CONSCIENTE. Você joga a
 * descrição, a IA extrai e sugere o título; você confirma o nome (cria/atualiza cargo),
 * marca se é liderança e resolve CADA campo: preenche OU marca "não se aplica". Núcleo
 * (nome + descrição) é obrigatório de verdade; o resto exige decisão consciente — força
 * atenção sem forçar invenção. WYSIWYG: salva com autoAceitaAte:'nunca' (só o incluído entra).
 *
 * NOTA React: ItemRow/DispensaCtrl/DispensadoBox são de ESCOPO DE MÓDULO (não definidos
 * dentro do componente) — se fossem internos, cada keystroke recriaria o tipo e o React
 * remontaria o <textarea>, tirando o foco a cada letra.
 */
import { useEffect, useState, useCallback } from 'react';
import { Loader2, FileText, Upload, Check, X, HelpCircle, Plus, Save, Sparkles, RefreshCw, Ban } from 'lucide-react';
import { listarCargosDaEmpresa, extrairDescricaoCargo, salvarRevisaoCargo } from '@/actions/cargo-extracao';
import type { ExtracaoCargo, ItemEvid } from '@/lib/cargo-extracao/adapter';

type Tipo = 'escalar' | 'array';
const ESCALARES: { k: string; label: string; nucleo?: boolean; hint?: string }[] = [
  { k: 'descricao', label: 'Descrição', nucleo: true },
  { k: 'area_depto', label: 'Área / Departamento', hint: 'se o documento não trouxe, preencha' },
  { k: 'contexto_cultural', label: 'Contexto cultural' },
];
const ARRAYS: { k: string; label: string }[] = [
  { k: 'principais_entregas', label: 'Principais entregas' },
  { k: 'stakeholders', label: 'Stakeholders' },
  { k: 'decisoes_recorrentes', label: 'Decisões recorrentes' },
  { k: 'tensoes_comuns', label: 'Tensões comuns' },
];
const CAMPOS: { k: string; label: string; tipo: Tipo; nucleo?: boolean }[] = [
  ...ESCALARES.map((e) => ({ k: e.k, label: e.label, tipo: 'escalar' as Tipo, nucleo: e.nucleo })),
  ...ARRAYS.map((a) => ({ k: a.k, label: a.label, tipo: 'array' as Tipo })),
];
const CONF_COR: Record<string, string> = { alta: 'text-emerald-400 bg-emerald-400/10', media: 'text-amber-400 bg-amber-400/10', baixa: 'text-red-400 bg-red-400/10' };
const novoItem = (): ItemEvid => ({ texto: '', confianca: 'alta', fonte: 'Inserido na revisão', aprovado: true });
const escalarVazio = (): ItemEvid => ({ texto: '', confianca: 'baixa', fonte: '', aprovado: false });
const norm = (s: string) => s.trim().toLowerCase();

// ── Componentes de escopo de módulo (identidade estável → textarea não perde foco) ──
function ItemRow({ it, onToggle, onEdit, onRemove, placeholder }: { it: ItemEvid; onToggle: () => void; onEdit: (v: string) => void; onRemove?: () => void; placeholder?: string }) {
  const estado = it.aprovado === true ? 'in' : it.aprovado === false ? 'out' : 'rev';
  const cor = estado === 'in' ? 'border-emerald-400/40 bg-emerald-400/5' : estado === 'out' ? 'border-white/5 bg-white/[0.01]' : 'border-amber-400/30 bg-amber-400/5';
  return (
    <div className={`rounded-lg border p-2 ${cor}`}>
      <div className="flex items-start gap-2">
        <button onClick={onToggle} title="Incluir / excluir" className="shrink-0 mt-0.5">
          {estado === 'in' ? <Check size={15} className="text-emerald-400" /> : estado === 'out' ? <X size={15} className="text-slate-500" /> : <HelpCircle size={15} className="text-amber-400" />}
        </button>
        <div className="flex-1 min-w-0">
          <textarea value={it.texto} placeholder={placeholder} onChange={(e) => onEdit(e.target.value)} rows={Math.max(1, Math.ceil((it.texto.length || 20) / 70))}
            className="w-full bg-transparent text-sm text-slate-100 resize-none outline-none border-b border-white/5 focus:border-brand-400/50 leading-snug placeholder:text-slate-600" />
          {it.fonte && <div className="text-[10px] text-slate-500 mt-1 italic truncate" title={it.fonte}>fonte: {it.fonte}</div>}
        </div>
        <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded ${CONF_COR[it.confianca] || ''}`}>{it.confianca}</span>
        {onRemove && <button onClick={onRemove} className="shrink-0 text-slate-600 hover:text-red-400"><X size={13} /></button>}
      </div>
    </div>
  );
}
function DispensaCtrl({ dispensado, onToggle }: { dispensado: boolean; onToggle: (on: boolean) => void }) {
  return dispensado
    ? <button onClick={() => onToggle(false)} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200"><RefreshCw size={10} /> reativar</button>
    : <button onClick={() => onToggle(true)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-amber-300"><Ban size={10} /> não se aplica</button>;
}
function DispensadoBox() {
  return <div className="rounded-lg border border-white/5 bg-white/[0.01] p-2 text-[11px] text-slate-500 italic">Marcado como “não se aplica” a este cargo.</div>;
}

export default function CargoExtracaoPanel({ empresaId }: { empresaId: string }) {
  const [cargos, setCargos] = useState<{ nome: string; eh_lideranca: boolean }[]>([]);
  const [modo, setModo] = useState<'pdf' | 'texto'>('texto');
  const [texto, setTexto] = useState('');
  const [pdf, setPdf] = useState<{ nome: string; base64: string } | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [ext, setExt] = useState<ExtracaoCargo | null>(null);
  const [nome, setNome] = useState('');
  const [ehLideranca, setEhLideranca] = useState(false);
  const [dispensados, setDispensados] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [okMsg, setOkMsg] = useState('');

  useEffect(() => { listarCargosDaEmpresa(empresaId).then((r) => setCargos(r.cargos)); }, [empresaId]);

  const onPdf = (f: File | undefined) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPdf({ nome: f.name, base64: String(r.result).split(',')[1] || '' });
    r.readAsDataURL(f);
  };

  async function extrair() {
    setExtraindo(true); setErro(''); setOkMsg(''); setExt(null); setDispensados(new Set());
    try {
      const input = modo === 'pdf' ? { pdfBase64: pdf?.base64, nomeArquivo: pdf?.nome } : { texto };
      const r = await extrairDescricaoCargo(empresaId, input);
      if (r.success && r.extracao) {
        const e = { ...r.extracao };
        for (const { k } of ESCALARES) if (!(e as any)[k]) (e as any)[k] = escalarVazio();
        setExt(e);
        const nomeSug = r.extracao.cargo_titulo?.texto?.trim() || '';
        setNome(nomeSug);
        const existe = cargos.find((c) => norm(c.nome) === norm(nomeSug));
        setEhLideranca(existe ? existe.eh_lideranca : false);
      } else setErro(r.error || 'Falha na extração.');
    } catch { setErro('Falha na extração.'); }
    setExtraindo(false);
  }

  const patchItem = useCallback((campo: string, idx: number | null, patch: Partial<ItemEvid>) => {
    setExt((cur) => {
      if (!cur) return cur;
      if (idx === null) { const it = (cur as any)[campo] as ItemEvid | undefined; return { ...cur, [campo]: { ...(it || novoItem()), ...patch } }; }
      const arr = [...(((cur as any)[campo] as ItemEvid[]) || [])]; arr[idx] = { ...arr[idx], ...patch }; return { ...cur, [campo]: arr };
    });
  }, []);
  const editar = (campo: string, idx: number | null, it: ItemEvid, v: string) => { if (v.trim()) setDispensados((d) => { const n = new Set(d); n.delete(campo); return n; }); patchItem(campo, idx, { texto: v, ...(v.trim() && it.aprovado !== false ? { aprovado: true } : {}) }); };
  const addItem = (campo: string) => { setDispensados((d) => { const n = new Set(d); n.delete(campo); return n; }); setExt((cur) => cur && ({ ...cur, [campo]: [...(((cur as any)[campo] as ItemEvid[]) || []), novoItem()] })); };
  const rmItem = (campo: string, idx: number) => setExt((cur) => cur && ({ ...cur, [campo]: ((cur as any)[campo] as ItemEvid[]).filter((_, i) => i !== idx) }));
  const toggle = (campo: string, idx: number | null, cur?: boolean) => patchItem(campo, idx, { aprovado: cur === true ? false : true });
  const dispensar = (k: string, on: boolean) => setDispensados((d) => { const n = new Set(d); on ? n.add(k) : n.delete(k); return n; });

  const contaIncluidos = (campo: string) => ((ext as any)?.[campo] as ItemEvid[] || []).filter((i) => i.aprovado === true).length;
  const temConteudo = (k: string, tipo: Tipo) => tipo === 'array' ? contaIncluidos(k) > 0 : !!(((ext as any)?.[k] as ItemEvid)?.aprovado === true && ((ext as any)?.[k] as ItemEvid)?.texto.trim());
  const resolvido = (c: { k: string; tipo: Tipo; nucleo?: boolean }) => temConteudo(c.k, c.tipo) || (!c.nucleo && dispensados.has(c.k));

  const resolvidos = ext ? CAMPOS.filter(resolvido).length : 0;
  const faltam = ext ? CAMPOS.filter((c) => !resolvido(c)) : [];
  const existente = cargos.find((c) => norm(c.nome) === norm(nome));
  const podeExtrair = (modo === 'texto' ? texto.trim().length > 20 : !!pdf) && !extraindo;
  const podeSalvar = !!ext?.documento_valido && !!nome.trim() && faltam.length === 0 && !salvando;

  async function salvar() {
    if (!ext || !nome.trim()) return;
    setSalvando(true); setErro(''); setOkMsg('');
    try {
      const r = await salvarRevisaoCargo(empresaId, nome.trim(), ext, { autoAceitaAte: 'nunca' }, ehLideranca);
      if (r.success) {
        setOkMsg(`${r.criado ? 'Vaga criada' : 'Vaga atualizada'}: "${nome.trim()}" — ${r.gravados?.length ? r.gravados.join(', ') : 'sem campos de conteúdo'}.`);
        if (r.criado) listarCargosDaEmpresa(empresaId).then((x) => setCargos(x.cargos));
      } else setErro(r.error || 'Falha ao salvar.');
    } catch { setErro('Falha ao salvar.'); }
    setSalvando(false);
  }

  return (
    <div className="space-y-4">
      {/* 1) Documento */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Documento:</span>
          <button onClick={() => setModo('texto')} className={`px-2 py-1 rounded border ${modo === 'texto' ? 'border-brand-400 text-brand-200' : 'border-white/10 text-slate-400'}`}>Colar texto</button>
          <button onClick={() => setModo('pdf')} className={`px-2 py-1 rounded border ${modo === 'pdf' ? 'border-brand-400 text-brand-200' : 'border-white/10 text-slate-400'}`}>PDF</button>
        </div>
        {modo === 'texto'
          ? <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole aqui a descrição do cargo…" rows={6} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-slate-100 outline-none focus:border-brand-400/50" />
          : <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer border border-dashed border-white/15 rounded-lg p-3 hover:bg-white/[0.03]">
              <Upload size={15} className="text-brand-400" />{pdf ? pdf.nome : 'Escolher PDF (documento nativo, até 20MB)'}
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => onPdf(e.target.files?.[0])} />
            </label>}
        <button onClick={extrair} disabled={!podeExtrair} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-brand-400/40 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20 disabled:opacity-40 text-sm">
          {extraindo ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} {extraindo ? 'Extraindo…' : 'Extrair descrição'}
        </button>
        {erro && !ext && <p className="text-xs text-red-400">{erro}</p>}
      </div>

      {ext && !ext.documento_valido && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/5 p-3 text-xs text-red-300">Este documento não parece ser uma descrição de cargo. {ext.trechos_ambiguos?.join(' ')}</div>
      )}

      {ext && ext.documento_valido && (
        <>
          {/* 2) Identidade — nome (cria/vincula) + liderança */}
          <div className="rounded-xl border border-brand-400/20 bg-brand-500/[0.04] p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1 min-w-[220px] text-xs text-slate-400">Nome da vaga <span className="text-red-400">*</span> <span className="text-slate-600">(sugerido do documento — edite se preciso)</span>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Coordenação Pedagógica" className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-brand-400/50" />
              </label>
              {nome.trim() && (existente
                ? <span className="flex items-center gap-1 text-[11px] text-cyan-300 bg-cyan-400/10 px-2 py-1.5 rounded-lg"><RefreshCw size={12} /> atualiza vaga</span>
                : <span className="flex items-center gap-1 text-[11px] text-emerald-300 bg-emerald-400/10 px-2 py-1.5 rounded-lg"><Sparkles size={12} /> nova vaga</span>)}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={ehLideranca} onChange={(e) => setEhLideranca(e.target.checked)} className="accent-brand-400" />
              É cargo de liderança? <span className="text-[10px] text-slate-500">(muda pesos e eliminatórias no gabarito — o documento raramente diz isso)</span>
            </label>
          </div>

          {/* Barra de progresso — cada campo: preencher OU "não se aplica" */}
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="text-slate-300 font-semibold">Preenchimento consciente do cargo</span>
              <span className={faltam.length === 0 ? 'text-emerald-400' : 'text-slate-400'}>{resolvidos}/{CAMPOS.length} campos</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-emerald-400 transition-all" style={{ width: `${(resolvidos / CAMPOS.length) * 100}%` }} /></div>
            {faltam.length > 0
              ? <div className="text-[10px] text-slate-500 mt-1.5">Falta resolver (preencher ou marcar “não se aplica”): <span className="text-amber-300/90">{faltam.map((c) => c.label + (c.nucleo ? '*' : '')).join(', ')}</span></div>
              : <div className="text-[10px] text-emerald-400/80 mt-1.5">Todos os campos resolvidos.</div>}
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-3 flex-wrap">
            <span><Check size={11} className="inline text-emerald-400" /> incluído</span>
            <span><HelpCircle size={11} className="inline text-amber-400" /> revisar</span>
            <span><X size={11} className="inline text-slate-500" /> fora</span>
            <span className="text-slate-500">* obrigatório · demais: preencha ou marque “não se aplica”.</span>
          </div>

          {ESCALARES.map(({ k, label, nucleo, hint }) => {
            const it = (ext as any)[k] as ItemEvid;
            const disp = dispensados.has(k) && !temConteudo(k, 'escalar');
            return (
              <div key={k}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-semibold text-slate-300">{label} {nucleo && <span className="text-red-400">*</span>} {hint && <span className="text-[10px] text-slate-500 font-normal">({hint})</span>}</div>
                  {!nucleo && !temConteudo(k, 'escalar') && <DispensaCtrl dispensado={dispensados.has(k)} onToggle={(on) => dispensar(k, on)} />}
                </div>
                {disp ? <DispensadoBox /> : <ItemRow it={it} onToggle={() => toggle(k, null, it.aprovado)} onEdit={(v) => editar(k, null, it, v)} placeholder={k === 'area_depto' ? 'ex.: Educação / Coordenação' : undefined} />}
              </div>
            );
          })}

          {ARRAYS.map(({ k, label }) => {
            const disp = dispensados.has(k) && contaIncluidos(k) === 0;
            const itens = (ext as any)[k] as ItemEvid[] || [];
            return (
              <div key={k}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-semibold text-slate-300">{label} <span className="text-[10px] text-slate-500">({contaIncluidos(k)} incluídos)</span></div>
                  <div className="flex items-center gap-3">
                    {contaIncluidos(k) === 0 && <DispensaCtrl dispensado={dispensados.has(k)} onToggle={(on) => dispensar(k, on)} />}
                    <button onClick={() => addItem(k)} className="flex items-center gap-1 text-[10px] text-brand-300 hover:text-brand-200"><Plus size={11} /> adicionar</button>
                  </div>
                </div>
                {disp ? <DispensadoBox /> : (
                  <div className="space-y-1.5">
                    {itens.map((it, i) => <ItemRow key={i} it={it} onToggle={() => toggle(k, i, it.aprovado)} onEdit={(v) => editar(k, i, it, v)} onRemove={() => rmItem(k, i)} />)}
                    {itens.length === 0 && <p className="text-[11px] text-slate-500">Nada extraído. Adicione manualmente ou marque “não se aplica”.</p>}
                  </div>
                )}
              </div>
            );
          })}

          {!!ext.elicitar_na_revisao?.length && (
            <div className="rounded-lg border border-amber-400/25 bg-amber-400/5 p-3">
              <div className="text-xs font-semibold text-amber-300 mb-1">Perguntas para completar (o documento não trouxe)</div>
              <ul className="space-y-1">{ext.elicitar_na_revisao.map((q, i) => <li key={i} className="text-[11px] text-amber-200/90">• {q}</li>)}</ul>
              <p className="text-[10px] text-amber-200/60 mt-1.5">Decisões/tensões são o sinal mais forte para o gabarito — responda acima ou marque “não se aplica”.</p>
            </div>
          )}

          {/* Salvar */}
          <div className="flex items-center gap-3 pt-2 border-t border-white/5">
            <button onClick={salvar} disabled={!podeSalvar} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40 text-sm">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {existente ? 'Atualizar vaga' : 'Criar vaga'}
            </button>
            {!nome.trim() && <span className="text-[11px] text-slate-500">informe o nome da vaga</span>}
            {nome.trim() && faltam.length > 0 && <span className="text-[11px] text-amber-400/80">resolva os {faltam.length} campos pendentes</span>}
            {okMsg && <p className="text-xs text-emerald-400">{okMsg}</p>}
            {erro && <p className="text-xs text-red-400">{erro}</p>}
          </div>
        </>
      )}
    </div>
  );
}
