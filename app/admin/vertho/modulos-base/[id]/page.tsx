'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save, Send, CheckCircle2, Archive, Languages, AlertTriangle, ShieldCheck, ShieldAlert, Sparkles, RotateCcw } from 'lucide-react';
import BackButton from '@/components/back-button';
import {
  obterModulo, listarCompetenciasBase, salvarModulo,
  submeterRevisao, aprovarPublicar, marcarObsoleto, criarTraducao, obterGrupo,
  auditarModuloBase,
} from '@/actions/modulos-base';

const NIVEIS = ['N1', 'N2', 'N3', 'N4'];
const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];

export default function ModuloBaseEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNovo = id === 'novo';
  const router = useRouter();
  const [m, setM] = useState<any>(null);
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [variantes, setVariantes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  // JSONB blocks como string (editor textarea com validação)
  const [centralJson, setCentralJson] = useState('{}');
  const [aplicavelJson, setAplicavelJson] = useState('{}');
  const [guardaJson, setGuardaJson] = useState('{}');
  const [formatoJson, setFormatoJson] = useState('{}');

  async function carregar() {
    setLoading(true); setErro('');
    const compResp = await listarCompetenciasBase();
    if ('competencias' in compResp) setCompetencias(compResp.competencias || []);

    if (isNovo) {
      setM({
        competencia_base_id: '', locale: 'pt-BR',
        nivel_entrada: 'N1', nivel_destino: 'N2',
        titulo: '', finalidade: '',
        contexto_pedagogico: '', tags: [],
        status: 'rascunho', versao: 1,
        conteudo_central: {}, conteudo_aplicavel: {},
        guarda_corpos: {}, adaptacao_por_formato: {},
        created_by: '—',
      });
      setLoading(false);
      return;
    }

    const r = await obterModulo(id);
    if ('error' in r) { setErro(r.error || 'Erro'); setLoading(false); return; }
    setM(r.modulo);
    setCentralJson(JSON.stringify(r.modulo.conteudo_central || {}, null, 2));
    setAplicavelJson(JSON.stringify(r.modulo.conteudo_aplicavel || {}, null, 2));
    setGuardaJson(JSON.stringify(r.modulo.guarda_corpos || {}, null, 2));
    setFormatoJson(JSON.stringify(r.modulo.adaptacao_por_formato || {}, null, 2));

    // Variantes do grupo (i18n)
    const g = await obterGrupo(r.modulo.grupo_id);
    if ('variantes' in g) setVariantes((g as any).variantes || []);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [id]);

  function parsearJson(rotulo: string, txt: string) {
    try { return JSON.parse(txt); }
    catch (e: any) { throw new Error(`${rotulo}: JSON inválido (${e.message})`); }
  }

  async function salvar() {
    setErro(''); setAviso(''); setSaving(true);
    try {
      const payload = {
        id: isNovo ? undefined : id,
        competencia_base_id: m.competencia_base_id,
        locale: m.locale,
        nivel_entrada: m.nivel_entrada,
        nivel_destino: m.nivel_destino,
        titulo: m.titulo,
        finalidade: m.finalidade,
        contexto_pedagogico: m.contexto_pedagogico,
        tags: m.tags,
        conteudo_central: parsearJson('conteudo_central', centralJson),
        conteudo_aplicavel: parsearJson('conteudo_aplicavel', aplicavelJson),
        guarda_corpos: parsearJson('guarda_corpos', guardaJson),
        adaptacao_por_formato: parsearJson('adaptacao_por_formato', formatoJson),
      };
      const r = await salvarModulo(payload);
      if ('error' in r && r.error) setErro(r.error);
      else {
        setAviso('Salvo');
        if (isNovo && 'id' in r) router.replace(`/admin/vertho/modulos-base/${r.id}`);
        else carregar();
      }
    } catch (e: any) { setErro(e.message); }
    setSaving(false);
  }

  async function reauditar() {
    setErro(''); setAviso(''); setSaving(true);
    const r = await auditarModuloBase(id);
    setSaving(false);
    if ('error' in r && r.error) setErro(r.error);
    else { setAviso('Auditoria atualizada'); carregar(); }
  }

  async function acao(fn: () => Promise<any>, nome: string) {
    setErro(''); setAviso(''); setSaving(true);
    const r = await fn();
    setSaving(false);
    if (r?.error) setErro(r.error);
    else { setAviso(`${nome} ok`); carregar(); }
  }

  async function traduzir(locale: string) {
    setSaving(true);
    const r = await criarTraducao(id, locale as any);
    setSaving(false);
    if ('error' in r && r.error) setErro(r.error);
    else if ('id' in r) router.push(`/admin/vertho/modulos-base/${r.id}`);
  }

  if (loading || !m) {
    return <div className="flex items-center justify-center min-h-full bg-[#07162a] py-20"><Loader2 size={28} className="animate-spin text-cyan-300" /></div>;
  }

  const localesExistentes = new Set(variantes.map((v: any) => v.locale));
  const podeEditarCabecalho = m.status === 'rascunho';

  return (
    <div className="min-h-full bg-[#07162a] px-6 py-8 text-white">
      <div className="max-w-[1100px] mx-auto">
        <BackButton href="/admin/vertho/modulos-base" />

        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1">Módulo-Base · {m.status} · v{m.versao} · {m.locale}</p>
            <h1 className="text-xl font-bold text-white truncate">{m.titulo || '(sem título)'}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={salvar} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-[#06172C] disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#34c5cc,#0D9488)' }}>
              <Save size={14} /> Salvar
            </button>
            {m.status === 'rascunho' && !isNovo && (
              <button onClick={() => acao(() => submeterRevisao(id), 'Submetido')} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-amber-300/40 text-amber-200 hover:bg-amber-400/10">
                <Send size={14} /> Submeter pra revisão
              </button>
            )}
            {m.status === 'revisao' && !isNovo && (
              <button onClick={reauditar} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-cyan-300/40 text-cyan-200 hover:bg-cyan-400/10">
                <RotateCcw size={14} /> Reauditar
              </button>
            )}
            {m.status === 'revisao' && (
              <button onClick={() => acao(() => aprovarPublicar(id), 'Publicado')} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-300/40 text-emerald-200 hover:bg-emerald-400/10">
                <CheckCircle2 size={14} /> Aprovar e publicar
              </button>
            )}
            {m.status === 'publicado' && (
              <button onClick={() => acao(() => marcarObsoleto(id), 'Marcado obsoleto')} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/15 hover:bg-white/5">
                <Archive size={14} /> Marcar obsoleto
              </button>
            )}
          </div>
        </div>

        {erro && <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 mb-3 text-sm text-red-200 flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>{erro}</span></div>}
        {aviso && <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 mb-3 text-sm text-emerald-200">{aviso}</div>}

        {/* Variantes (i18n) */}
        {!isNovo && (
          <div className="rounded-xl border border-white/[0.06] p-3 mb-5">
            <div className="flex items-center gap-2 mb-2"><Languages size={13} className="text-cyan-300" /><p className="text-[11px] uppercase tracking-widest text-white/45">Variantes deste grupo</p></div>
            <div className="flex flex-wrap gap-1.5">
              {variantes.map((v: any) => (
                <button key={v.id} onClick={() => v.id !== id && router.push(`/admin/vertho/modulos-base/${v.id}`)}
                  className={`text-[11px] px-2 py-1 rounded-md ${v.id === id ? 'bg-cyan-400/20 text-cyan-200 border border-cyan-400/30' : 'bg-white/[0.05] text-white/70 hover:bg-white/[0.08]'}`}>
                  {v.locale} · {v.status}
                </button>
              ))}
              {LOCALES.filter(l => !localesExistentes.has(l)).map(l => (
                <button key={l} onClick={() => traduzir(l)} disabled={saving}
                  className="text-[11px] px-2 py-1 rounded-md border border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10">
                  + criar {l}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Auditoria IA (Dual-IA — substitui revisão humana cruzada) */}
        {!isNovo && <AuditoriaCard m={m} />}

        {/* Identificação */}
        <Card titulo="Identificação">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Competência base*">
              <select disabled={!podeEditarCabecalho} value={m.competencia_base_id} onChange={e => setM({ ...m, competencia_base_id: e.target.value })}
                className="input">
                <option value="">— selecione —</option>
                {competencias.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.segmento})</option>)}
              </select>
            </Field>
            <Field label="Idioma*">
              <select disabled={!isNovo} value={m.locale} onChange={e => setM({ ...m, locale: e.target.value })} className="input">
                {LOCALES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Nível entrada*">
              <select disabled={!podeEditarCabecalho} value={m.nivel_entrada} onChange={e => setM({ ...m, nivel_entrada: e.target.value })} className="input">
                {NIVEIS.slice(0, 3).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Nível destino*">
              <select disabled={!podeEditarCabecalho} value={m.nivel_destino} onChange={e => setM({ ...m, nivel_destino: e.target.value })} className="input">
                {NIVEIS.slice(1).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Título* (≤120)">
              <input value={m.titulo} maxLength={120} onChange={e => setM({ ...m, titulo: e.target.value })} className="input" />
            </Field>
            <Field label="Contexto pedagógico (opc.)">
              <input value={m.contexto_pedagogico || ''} maxLength={80} onChange={e => setM({ ...m, contexto_pedagogico: e.target.value })} className="input" placeholder="ex.: educacao-infantil" />
            </Field>
            <Field label="Finalidade* (≤400)" className="md:col-span-2">
              <textarea value={m.finalidade} maxLength={400} onChange={e => setM({ ...m, finalidade: e.target.value })} className="input min-h-[72px]" />
            </Field>
            <Field label="Tags (vírgula)" className="md:col-span-2">
              <input value={(m.tags || []).join(', ')} onChange={e => setM({ ...m, tags: e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean) })} className="input" placeholder="ex.: acolhimento, escuta-ativa" />
            </Field>
          </div>
          <p className="text-[10px] text-white/40 mt-3">
            Cabeçalho conceitual só pode ser editado em rascunho. Criado por <strong>{m.created_by}</strong>{m.published_by ? ` · publicado por ${m.published_by}` : ''}.
          </p>
        </Card>

        {/* Blocos JSONB */}
        <Card titulo="Bloco 1 — Conteúdo central"
          dica="ideia_principal · explicacao_expandida · principios[] · sintese_executiva">
          <JsonEditor value={centralJson} onChange={setCentralJson} />
        </Card>

        <Card titulo="Bloco 2 — Conteúdo aplicável"
          dica="situacoes_tipicas[] · exemplos_universais · erros_comuns[] · repertorio_linguagem · boas_praticas[]">
          <JsonEditor value={aplicavelJson} onChange={setAplicavelJson} />
        </Card>

        <Card titulo="Bloco 3 — Guarda-corpos pra IA"
          dica="preservar · evitar · pode_adaptar_livremente · nao_pode_adaptar · cuidados_eticos · cuidados_linguagem">
          <JsonEditor value={guardaJson} onChange={setGuardaJson} />
        </Card>

        <Card titulo="Bloco 4 — Adaptação por formato"
          dica="texto · podcast_roteiro · video_roteiro">
          <JsonEditor value={formatoJson} onChange={setFormatoJson} />
        </Card>

        <style jsx global>{`
          .input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px 10px; font-size: 13px; color: #fff; width: 100%; }
          .input:disabled { opacity: 0.5; cursor: not-allowed; }
        `}</style>
      </div>
    </div>
  );
}

function Card({ titulo, dica, children }: { titulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.08] p-4 mb-4 bg-white/[0.02]">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold text-white">{titulo}</h2>
        {dica && <p className="text-[10px] text-white/40 font-mono truncate">{dica}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[10px] uppercase tracking-wide text-white/45">{label}</label>
      {children}
    </div>
  );
}

function AuditoriaCard({ m }: { m: any }) {
  const a = m.auditoria_ia;
  const versaoOk = m.auditado_em_versao === m.versao;
  const veredito = a?.veredito;
  const conf = a?.confianca ? Math.round(a.confianca * 100) : 0;

  if (!a) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 mb-4 flex items-center gap-2 text-xs text-white/55">
        <Sparkles size={13} className="text-cyan-300" />
        <span>Sem auditoria ainda. {m.status === 'rascunho' ? 'Submeta pra revisão pra disparar a IA-auditora.' : 'Clique em "Reauditar" pra rodar agora.'}</span>
      </div>
    );
  }

  const cor = veredito === 'aprovado' ? 'emerald'
    : veredito === 'aprovado_com_ressalvas' ? 'amber'
    : 'red';
  const palette: Record<string, { border: string; bg: string; text: string; icon: any }> = {
    emerald: { border: 'border-emerald-400/30', bg: 'bg-emerald-400/[0.06]', text: 'text-emerald-200', icon: ShieldCheck },
    amber:   { border: 'border-amber-400/30',   bg: 'bg-amber-400/[0.06]',   text: 'text-amber-200',   icon: ShieldCheck },
    red:     { border: 'border-red-400/30',     bg: 'bg-red-400/[0.06]',     text: 'text-red-200',     icon: ShieldAlert },
  };
  const p = palette[cor];
  const Icon = p.icon;
  const verdLabel = veredito === 'aprovado' ? 'Aprovado'
    : veredito === 'aprovado_com_ressalvas' ? 'Aprovado com ressalvas'
    : 'Reprovado';

  return (
    <div className={`rounded-xl border ${p.border} ${p.bg} p-4 mb-4`}>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Icon size={16} className={p.text} />
          <h2 className={`text-sm font-bold ${p.text}`}>Auditoria IA · {verdLabel}</h2>
          {conf > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70">{conf}% confiança</span>
          )}
        </div>
        <p className="text-[10px] text-white/45 font-mono">
          {m.auditado_por_modelo || '—'} · v{m.auditado_em_versao} {!versaoOk && '(módulo editado depois — reauditar)'}
        </p>
      </div>

      {Array.isArray(a.problemas) && a.problemas.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1">Problemas encontrados ({a.problemas.length})</p>
          <ul className="space-y-1.5">
            {a.problemas.map((pr: any, i: number) => (
              <li key={i} className="text-[12px] text-white/85 flex items-start gap-2">
                <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded mt-0.5 shrink-0 ${
                  pr.gravidade === 'alta' ? 'bg-red-400/20 text-red-200'
                  : pr.gravidade === 'media' ? 'bg-amber-400/20 text-amber-200'
                  : 'bg-white/10 text-white/55'
                }`}>{pr.gravidade}</span>
                <div>
                  <span className="text-white/55 text-[10px] font-mono">[{pr.categoria}]</span>{' '}
                  {pr.descricao}
                  {pr.campo_afetado && <span className="text-white/40 text-[10px] font-mono"> · {pr.campo_afetado}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(a.recomendacoes) && a.recomendacoes.length > 0 && (
        <div className="mt-3 pt-2 border-t border-white/[0.08]">
          <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1">Recomendações</p>
          <ul className="space-y-0.5">
            {a.recomendacoes.map((rec: string, i: number) => (
              <li key={i} className="text-[12px] text-white/75">• {rec}</li>
            ))}
          </ul>
        </div>
      )}

      {(!a.problemas || a.problemas.length === 0) && veredito === 'aprovado' && (
        <p className="text-[12px] text-white/60">Nenhum problema apontado. Módulo está pronto pra publicação.</p>
      )}
    </div>
  );
}

function JsonEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  let valido = true;
  try { JSON.parse(value); } catch { valido = false; }
  return (
    <div>
      <textarea value={value} onChange={e => onChange(e.target.value)}
        spellCheck={false}
        className="w-full font-mono text-[11px] leading-relaxed bg-black/30 border rounded-lg px-3 py-2 min-h-[260px] text-white"
        style={{ borderColor: valido ? 'rgba(255,255,255,0.1)' : 'rgba(248,113,113,0.5)' }} />
      {!valido && <p className="text-[10px] text-red-300 mt-1">JSON inválido</p>}
    </div>
  );
}
