'use client';
/**
 * Tela de REVISÃO da Fase 0 — DOCUMENTO-PRIMEIRO. Você joga a descrição, a IA extrai e
 * SUGERE o título; você confirma o nome (cria um cargo novo OU atualiza um existente),
 * marca se é liderança e revisa cada item antes de gravar. WYSIWYG: salva com
 * autoAceitaAte:'nunca' → só o que está marcado "incluído" entra.
 */
import { useEffect, useState, useCallback } from 'react';
import { Loader2, FileText, Upload, Check, X, HelpCircle, Plus, Save, Sparkles, RefreshCw } from 'lucide-react';
import { listarCargosDaEmpresa, extrairDescricaoCargo, salvarRevisaoCargo } from '@/actions/cargo-extracao';
import type { ExtracaoCargo, ItemEvid } from '@/lib/cargo-extracao/adapter';

type CampoEscalar = 'area_depto' | 'descricao' | 'contexto_cultural';
type CampoArray = 'principais_entregas' | 'stakeholders' | 'decisoes_recorrentes' | 'tensoes_comuns';
const ESCALARES: { k: CampoEscalar; label: string; hint?: string }[] = [
  { k: 'area_depto', label: 'Área / Departamento', hint: 'se o documento não trouxe, preencha' },
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
const escalarVazio = (): ItemEvid => ({ texto: '', confianca: 'baixa', fonte: '', aprovado: false });
const norm = (s: string) => s.trim().toLowerCase();

export default function CargoExtracaoPanel({ empresaId }: { empresaId: string }) {
  const [cargos, setCargos] = useState<{ nome: string; eh_lideranca: boolean }[]>([]);
  const [modo, setModo] = useState<'pdf' | 'texto'>('texto');
  const [texto, setTexto] = useState('');
  const [pdf, setPdf] = useState<{ nome: string; base64: string } | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [ext, setExt] = useState<ExtracaoCargo | null>(null);
  const [nome, setNome] = useState('');
  const [ehLideranca, setEhLideranca] = useState(false);
  const [naoSeAplicaDT, setNaoSeAplicaDT] = useState(false);
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
    setExtraindo(true); setErro(''); setOkMsg(''); setExt(null); setNaoSeAplicaDT(false);
    try {
      const input = modo === 'pdf' ? { pdfBase64: pdf?.base64, nomeArquivo: pdf?.nome } : { texto };
      const r = await extrairDescricaoCargo(input);
      if (r.success && r.extracao) {
        // Garante os escalares sempre visíveis (mesmo vazios) p/ o gestor completar (ex.: área).
        const e = { ...r.extracao };
        for (const { k } of ESCALARES) if (!(e as any)[k]) (e as any)[k] = escalarVazio();
        setExt(e);
        const nomeSug = r.extracao.cargo_titulo?.texto?.trim() || '';
        setNome(nomeSug);
        const existe = cargos.find((c) => norm(c.nome) === norm(nomeSug));
        setEhLideranca(existe ? existe.eh_lideranca : false); // pré-carga só se já existe
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
  // Editar o texto: se passou a ter conteúdo e não foi excluído de propósito, marca incluir.
  const editar = (campo: string, idx: number | null, it: ItemEvid, v: string) => patchItem(campo, idx, { texto: v, ...(v.trim() && it.aprovado !== false ? { aprovado: true } : {}) });
  const addItem = (campo: CampoArray) => setExt((cur) => cur && ({ ...cur, [campo]: [...(((cur as any)[campo] as ItemEvid[]) || []), novoItem()] }));
  const rmItem = (campo: CampoArray, idx: number) => setExt((cur) => cur && ({ ...cur, [campo]: ((cur as any)[campo] as ItemEvid[]).filter((_, i) => i !== idx) }));
  const toggle = (campo: string, idx: number | null, cur?: boolean) => patchItem(campo, idx, { aprovado: cur === true ? false : true });

  const contaIncluidos = (campo: CampoArray) => ((ext as any)?.[campo] as ItemEvid[] || []).filter((i) => i.aprovado === true).length;
  const dtVazio = !!ext && contaIncluidos('decisoes_recorrentes') === 0 && contaIncluidos('tensoes_comuns') === 0;
  const existente = cargos.find((c) => norm(c.nome) === norm(nome));
  const podeExtrair = (modo === 'texto' ? texto.trim().length > 20 : !!pdf) && !extraindo;
  const podeSalvar = !!ext?.documento_valido && !!nome.trim() && (!dtVazio || naoSeAplicaDT) && !salvando;

  async function salvar() {
    if (!ext || !nome.trim()) return;
    setSalvando(true); setErro(''); setOkMsg('');
    try {
      const r = await salvarRevisaoCargo(empresaId, nome.trim(), ext, { autoAceitaAte: 'nunca' }, ehLideranca);
      if (r.success) {
        setOkMsg(`${r.criado ? 'Cargo criado' : 'Cargo atualizado'}: "${nome.trim()}" — ${r.gravados?.length ? r.gravados.join(', ') : 'sem campos de conteúdo'}.`);
        if (r.criado) listarCargosDaEmpresa(empresaId).then((x) => setCargos(x.cargos)); // reflete o novo na lista
      } else setErro(r.error || 'Falha ao salvar.');
    } catch { setErro('Falha ao salvar.'); }
    setSalvando(false);
  }

  const ItemRow = ({ campo, idx, it, removivel, placeholder }: { campo: string; idx: number | null; it: ItemEvid; removivel?: () => void; placeholder?: string }) => {
    const estado = it.aprovado === true ? 'in' : it.aprovado === false ? 'out' : 'rev';
    const cor = estado === 'in' ? 'border-emerald-400/40 bg-emerald-400/5' : estado === 'out' ? 'border-white/5 bg-white/[0.01]' : 'border-amber-400/30 bg-amber-400/5';
    return (
      <div className={`rounded-lg border p-2 ${cor}`}>
        <div className="flex items-start gap-2">
          <button onClick={() => toggle(campo, idx, it.aprovado)} title="Incluir / excluir" className="shrink-0 mt-0.5">
            {estado === 'in' ? <Check size={15} className="text-emerald-400" /> : estado === 'out' ? <X size={15} className="text-slate-500" /> : <HelpCircle size={15} className="text-amber-400" />}
          </button>
          <div className="flex-1 min-w-0">
            <textarea value={it.texto} placeholder={placeholder} onChange={(e) => editar(campo, idx, it, e.target.value)} rows={Math.max(1, Math.ceil((it.texto.length || 20) / 70))}
              className="w-full bg-transparent text-sm text-slate-100 resize-none outline-none border-b border-white/5 focus:border-brand-400/50 leading-snug placeholder:text-slate-600" />
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
          {/* 2) Identidade do cargo — nome (cria ou vincula) + liderança */}
          <div className="rounded-xl border border-brand-400/20 bg-brand-500/[0.04] p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex-1 min-w-[220px] text-xs text-slate-400">Nome do cargo <span className="text-slate-600">(sugerido do documento — edite se preciso)</span>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Coordenação Pedagógica" className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-brand-400/50" />
              </label>
              {nome.trim() && (existente
                ? <span className="flex items-center gap-1 text-[11px] text-cyan-300 bg-cyan-400/10 px-2 py-1.5 rounded-lg"><RefreshCw size={12} /> atualiza cargo existente</span>
                : <span className="flex items-center gap-1 text-[11px] text-emerald-300 bg-emerald-400/10 px-2 py-1.5 rounded-lg"><Sparkles size={12} /> cria cargo novo</span>)}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={ehLideranca} onChange={(e) => setEhLideranca(e.target.checked)} className="accent-brand-400" />
              É cargo de liderança? <span className="text-[10px] text-slate-500">(muda os pesos e as eliminatórias no gabarito — o documento raramente diz isso)</span>
            </label>
          </div>

          {/* 3) Campos revisáveis */}
          <div className="text-[11px] text-slate-400 flex items-center gap-3 flex-wrap">
            <span><Check size={11} className="inline text-emerald-400" /> incluído</span>
            <span><HelpCircle size={11} className="inline text-amber-400" /> revisar (não entra até incluir)</span>
            <span><X size={11} className="inline text-slate-500" /> fora</span>
            <span className="text-slate-500">Edite o texto direto; o que ficar incluído grava no cargo.</span>
          </div>

          {ESCALARES.map(({ k, label, hint }) => (
            <div key={k}>
              <div className="text-xs font-semibold text-slate-300 mb-1">{label} {hint && <span className="text-[10px] text-slate-500 font-normal">({hint})</span>}</div>
              <ItemRow campo={k} idx={null} it={(ext as any)[k]} placeholder={k === 'area_depto' ? 'ex.: Educação / Coordenação' : undefined} />
            </div>
          ))}

          {ARRAYS.map(({ k, label }) => (
            <div key={k}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-semibold text-slate-300">{label} <span className="text-[10px] text-slate-500">({contaIncluidos(k)} incluídos)</span></div>
                <button onClick={() => addItem(k)} className="flex items-center gap-1 text-[10px] text-brand-300 hover:text-brand-200"><Plus size={11} /> adicionar</button>
              </div>
              <div className="space-y-1.5">
                {((ext as any)[k] as ItemEvid[] || []).map((it, i) => <ItemRow key={i} campo={k} idx={i} it={it} removivel={() => rmItem(k, i)} />)}
                {(!((ext as any)[k]) || ((ext as any)[k] as ItemEvid[]).length === 0) && <p className="text-[11px] text-slate-500">Nada extraído. Se for relevante, adicione manualmente.</p>}
              </div>
            </div>
          ))}

          {/* 4) Elicitação — decisões/tensões são o sinal mais valioso */}
          {(dtVazio || !!ext.elicitar_na_revisao?.length) && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
              <div className="text-xs font-semibold text-amber-300 mb-1">Complete o que o documento não trouxe</div>
              {!!ext.elicitar_na_revisao?.length && <ul className="space-y-1 mb-2">{ext.elicitar_na_revisao.map((q, i) => <li key={i} className="text-[11px] text-amber-200/90">• {q}</li>)}</ul>}
              <p className="text-[10px] text-amber-200/70">Responda adicionando itens em <b>Decisões recorrentes</b> / <b>Tensões comuns</b> — é o sinal mais forte para o gabarito (DISC/liderança).</p>
              {dtVazio && (
                <label className="flex items-center gap-2 text-[11px] text-amber-200 mt-2 cursor-pointer">
                  <input type="checkbox" checked={naoSeAplicaDT} onChange={(e) => setNaoSeAplicaDT(e.target.checked)} className="accent-amber-400" />
                  Não há decisões/tensões relevantes para este cargo — salvar mesmo assim.
                </label>
              )}
            </div>
          )}

          {/* 5) Salvar */}
          <div className="flex items-center gap-3 pt-2 border-t border-white/5">
            <button onClick={salvar} disabled={!podeSalvar} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40 text-sm">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {existente ? 'Atualizar cargo' : 'Criar cargo'}
            </button>
            {!nome.trim() && <span className="text-[11px] text-slate-500">informe o nome do cargo</span>}
            {dtVazio && !naoSeAplicaDT && nome.trim() && <span className="text-[11px] text-amber-400/80">responda decisões/tensões ou marque "não se aplica"</span>}
            {okMsg && <p className="text-xs text-emerald-400">{okMsg}</p>}
            {erro && <p className="text-xs text-red-400">{erro}</p>}
          </div>
        </>
      )}
    </div>
  );
}
