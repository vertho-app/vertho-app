'use client';
/**
 * Tela de REVISÃO da Fase 0 — extrai a descrição de um documento e deixa o gestor
 * aprovar/editar/rejeitar cada item antes de gravar nas colunas do cargo (que a IA2 lê).
 * WYSIWYG: salva com autoAceitaAte:'nunca' → só o que está marcado "incluído" entra.
 */
import { useEffect, useState, useCallback } from 'react';
import { Loader2, FileText, Upload, Check, X, HelpCircle, Plus, Save } from 'lucide-react';
import { listarCargosDaEmpresa, extrairDescricaoCargo, salvarRevisaoCargo } from '@/actions/cargo-extracao';
import type { ExtracaoCargo, ItemEvid } from '@/lib/cargo-extracao/adapter';

type CampoEscalar = 'cargo_titulo' | 'area_depto' | 'descricao' | 'contexto_cultural';
type CampoArray = 'principais_entregas' | 'stakeholders' | 'decisoes_recorrentes' | 'tensoes_comuns';
const ESCALARES: { k: CampoEscalar; label: string; nota?: string }[] = [
  { k: 'cargo_titulo', label: 'Título do cargo', nota: 'sugestão — não sobrescreve o nome' },
  { k: 'area_depto', label: 'Área / Departamento' },
  { k: 'descricao', label: 'Descrição' },
  { k: 'contexto_cultural', label: 'Contexto cultural' },
];
const ARRAYS: { k: CampoArray; label: string }[] = [
  { k: 'principais_entregas', label: 'Principais entregas' },
  { k: 'stakeholders', label: 'Stakeholders' },
  { k: 'decisoes_recorrentes', label: 'Decisões recorrentes' },
  { k: 'tensoes_comuns', label: 'Tensões comuns' },
];
const CONF_COR: Record<string, string> = { alta: 'text-emerald-400 bg-emerald-400/10', media: 'text-amber-400 bg-amber-400/10', baixa: 'text-red-400 bg-red-400/10' };
const novoItem = (): ItemEvid => ({ texto: '', confianca: 'alta', fonte: 'Inserido na revisão', aprovado: true });

export default function CargoExtracaoPanel({ empresaId }: { empresaId: string }) {
  const [cargos, setCargos] = useState<string[]>([]);
  const [cargo, setCargo] = useState('');
  const [modo, setModo] = useState<'pdf' | 'texto'>('texto');
  const [texto, setTexto] = useState('');
  const [pdf, setPdf] = useState<{ nome: string; base64: string } | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [ext, setExt] = useState<ExtracaoCargo | null>(null);
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
    setExtraindo(true); setErro(''); setOkMsg(''); setExt(null);
    try {
      const input = modo === 'pdf' ? { pdfBase64: pdf?.base64, nomeArquivo: pdf?.nome } : { texto };
      const r = await extrairDescricaoCargo(input);
      if (r.success && r.extracao) setExt(r.extracao); else setErro(r.error || 'Falha na extração.');
    } catch { setErro('Falha na extração.'); }
    setExtraindo(false);
  }

  // Atualização imutável de um item (escalar: idx=null; array: idx do item).
  const patchItem = useCallback((campo: string, idx: number | null, patch: Partial<ItemEvid>) => {
    setExt((cur) => {
      if (!cur) return cur;
      if (idx === null) { const it = (cur as any)[campo] as ItemEvid | undefined; return { ...cur, [campo]: { ...(it || novoItem()), ...patch } }; }
      const arr = [...(((cur as any)[campo] as ItemEvid[]) || [])]; arr[idx] = { ...arr[idx], ...patch }; return { ...cur, [campo]: arr };
    });
  }, []);
  const addItem = (campo: CampoArray) => setExt((cur) => cur && ({ ...cur, [campo]: [...(((cur as any)[campo] as ItemEvid[]) || []), novoItem()] }));
  const rmItem = (campo: CampoArray, idx: number) => setExt((cur) => cur && ({ ...cur, [campo]: ((cur as any)[campo] as ItemEvid[]).filter((_, i) => i !== idx) }));

  // Toggle incluir: undefined→true→false→true. Salva com 'nunca' → só true entra.
  const toggle = (campo: string, idx: number | null, cur?: boolean) => patchItem(campo, idx, { aprovado: cur === true ? false : true });

  async function salvar() {
    if (!ext || !cargo) return;
    setSalvando(true); setErro(''); setOkMsg('');
    try {
      const r = await salvarRevisaoCargo(empresaId, cargo, ext, { autoAceitaAte: 'nunca' });
      if (r.success) setOkMsg(r.gravados?.length ? `Gravado em "${cargo}": ${r.gravados.join(', ')}.` : 'Nada marcado para incluir — nenhum campo gravado.');
      else setErro(r.error || 'Falha ao salvar.');
    } catch { setErro('Falha ao salvar.'); }
    setSalvando(false);
  }

  const podeExtrair = !!cargo && (modo === 'texto' ? texto.trim().length > 20 : !!pdf) && !extraindo;

  const ItemRow = ({ campo, idx, it, removivel }: { campo: string; idx: number | null; it: ItemEvid; removivel?: () => void }) => {
    const estado = it.aprovado === true ? 'in' : it.aprovado === false ? 'out' : 'rev';
    const cor = estado === 'in' ? 'border-emerald-400/40 bg-emerald-400/5' : estado === 'out' ? 'border-white/5 bg-white/[0.01] opacity-50' : 'border-amber-400/30 bg-amber-400/5';
    return (
      <div className={`rounded-lg border p-2 ${cor}`}>
        <div className="flex items-start gap-2">
          <button onClick={() => toggle(campo, idx, it.aprovado)} title="Incluir / excluir" className="shrink-0 mt-0.5">
            {estado === 'in' ? <Check size={15} className="text-emerald-400" /> : estado === 'out' ? <X size={15} className="text-slate-500" /> : <HelpCircle size={15} className="text-amber-400" />}
          </button>
          <div className="flex-1 min-w-0">
            <textarea value={it.texto} onChange={(e) => patchItem(campo, idx, { texto: e.target.value })} rows={Math.max(1, Math.ceil(it.texto.length / 70))}
              className="w-full bg-transparent text-sm text-slate-100 resize-none outline-none border-b border-white/5 focus:border-brand-400/50 leading-snug" />
            {it.fonte && <div className="text-[10px] text-slate-500 mt-1 italic truncate" title={it.fonte}>fonte: {it.fonte}</div>}
          </div>
          <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded ${CONF_COR[it.confianca] || ''}`}>{it.confianca}</span>
          {removivel && <button onClick={removivel} className="shrink-0 text-slate-600 hover:text-red-400"><X size={13} /></button>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Entrada */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-slate-400">Cargo
            <select value={cargo} onChange={(e) => setCargo(e.target.value)} className="ml-2 bg-white/5 border border-white/10 rounded px-2 py-1 text-slate-200 text-xs">
              <option value="">Selecione…</option>
              {cargos.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1 text-xs">
            <button onClick={() => setModo('texto')} className={`px-2 py-1 rounded border ${modo === 'texto' ? 'border-brand-400 text-brand-200' : 'border-white/10 text-slate-400'}`}>Colar texto</button>
            <button onClick={() => setModo('pdf')} className={`px-2 py-1 rounded border ${modo === 'pdf' ? 'border-brand-400 text-brand-200' : 'border-white/10 text-slate-400'}`}>PDF</button>
          </div>
        </div>
        {modo === 'texto'
          ? <textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Cole aqui a descrição do cargo…" rows={6} className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-slate-100 outline-none focus:border-brand-400/50" />
          : <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer border border-dashed border-white/15 rounded-lg p-3 hover:bg-white/[0.03]">
              <Upload size={15} className="text-brand-400" />
              {pdf ? pdf.nome : 'Escolher PDF (documento nativo, até 20MB)'}
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => onPdf(e.target.files?.[0])} />
            </label>}
        <button onClick={extrair} disabled={!podeExtrair} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-brand-400/40 bg-brand-500/10 text-brand-200 hover:bg-brand-500/20 disabled:opacity-40 text-sm">
          {extraindo ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} {extraindo ? 'Extraindo…' : 'Extrair descrição'}
        </button>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
      </div>

      {ext && !ext.documento_valido && (
        <div className="rounded-lg border border-red-400/30 bg-red-400/5 p-3 text-xs text-red-300">
          Este documento não parece ser uma descrição de cargo. {ext.trechos_ambiguos?.join(' ')}
        </div>
      )}

      {ext && ext.documento_valido && (
        <>
          <div className="text-[11px] text-slate-400 flex items-center gap-3 flex-wrap">
            <span><Check size={11} className="inline text-emerald-400" /> incluído</span>
            <span><HelpCircle size={11} className="inline text-amber-400" /> revisar (não entra até incluir)</span>
            <span><X size={11} className="inline text-slate-500" /> fora</span>
            <span className="text-slate-500">Edite o texto direto; o que ficar incluído grava no cargo.</span>
          </div>

          {ESCALARES.map(({ k, label, nota }) => (ext as any)[k] && (
            <div key={k}>
              <div className="text-xs font-semibold text-slate-300 mb-1">{label} {nota && <span className="text-[10px] text-slate-500 font-normal">({nota})</span>}</div>
              <ItemRow campo={k} idx={null} it={(ext as any)[k]} />
            </div>
          ))}

          {ARRAYS.map(({ k, label }) => (
            <div key={k}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-semibold text-slate-300">{label} <span className="text-[10px] text-slate-500">({((ext as any)[k] || []).filter((i: ItemEvid) => i.aprovado === true).length} incluídos)</span></div>
                <button onClick={() => addItem(k)} className="flex items-center gap-1 text-[10px] text-brand-300 hover:text-brand-200"><Plus size={11} /> adicionar</button>
              </div>
              <div className="space-y-1.5">
                {((ext as any)[k] as ItemEvid[] || []).map((it, i) => <ItemRow key={i} campo={k} idx={i} it={it} removivel={() => rmItem(k, i)} />)}
                {(!((ext as any)[k]) || ((ext as any)[k] as ItemEvid[]).length === 0) && <p className="text-[11px] text-slate-500">Nada extraído. Se for relevante, adicione manualmente.</p>}
              </div>
            </div>
          ))}

          {!!ext.elicitar_na_revisao?.length && (
            <div className="rounded-lg border border-amber-400/25 bg-amber-400/5 p-3">
              <div className="text-xs font-semibold text-amber-300 mb-1">Perguntas para completar (o documento não trouxe)</div>
              <ul className="space-y-1">{ext.elicitar_na_revisao.map((q, i) => <li key={i} className="text-[11px] text-amber-200/90">• {q}</li>)}</ul>
              <p className="text-[10px] text-amber-200/60 mt-1.5">Responda adicionando itens em Decisões recorrentes / Tensões comuns acima — é o sinal mais valioso para o gabarito.</p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 border-t border-white/5">
            <button onClick={salvar} disabled={salvando || !cargo} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40 text-sm">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar no cargo
            </button>
            {okMsg && <p className="text-xs text-emerald-400">{okMsg}</p>}
            {erro && <p className="text-xs text-red-400">{erro}</p>}
          </div>
        </>
      )}
    </div>
  );
}
