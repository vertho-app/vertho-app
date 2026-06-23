'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Sparkles, Star, X, Trash2, Film } from 'lucide-react';
import BackButton from '@/components/back-button';
import { listarModulos, listarCompetenciasBase, rascunharModuloBase, setPreferido, excluirModulo } from '@/actions/modulos-base';

type Modulo = any;

const NIVEIS = ['N1', 'N2', 'N3', 'N4'];
const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
const STATUS = ['rascunho', 'revisao', 'publicado', 'obsoleto'];

const STATUS_COR: Record<string, string> = {
  rascunho: 'rgba(255,255,255,0.5)',
  revisao: '#FCD34D',
  publicado: '#34D399',
  obsoleto: 'rgba(255,255,255,0.35)',
};

export default function ModulosBaseListPage() {
  const router = useRouter();
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroLocale, setFiltroLocale] = useState('');
  const [filtroComp, setFiltroComp] = useState('');
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState<null | 'novo' | 'ia'>(null);

  async function carregar() {
    setLoading(true);
    const [m, c] = await Promise.all([
      listarModulos({
        status: (filtroStatus || undefined) as any,
        locale: (filtroLocale || undefined) as any,
        competencia_base_id: filtroComp || undefined,
        busca: busca || undefined,
      }),
      competencias.length === 0 ? listarCompetenciasBase() : Promise.resolve({ competencias }),
    ]);
    if ('error' in m) setErro(m.error || 'Erro ao carregar módulos');
    else { setErro(''); setModulos(m.modulos); }
    if ('competencias' in c) setCompetencias((c as any).competencias || []);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [filtroStatus, filtroLocale, filtroComp]);

  const compMap = useMemo(() => Object.fromEntries(competencias.map((c: any) => [c.id, c])), [competencias]);

  return (
    <div className="min-h-full bg-[#07162a] px-6 py-8 text-white">
      <div className="max-w-[1400px] mx-auto">
        <BackButton href="/admin/dashboard" />
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">Módulos-Base de Conteúdo</h1>
            <p className="text-sm text-white/55">Matéria-prima pedagógica canônica. Spec: <code className="text-cyan-300">docs/MODULOS-BASE-CONTEUDO.md</code></p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => router.push('/admin/vertho/modulos-base/extracao-video')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-purple-400/30 text-purple-300 hover:bg-purple-400/10">
              <Film size={14} /> Extrair / Importar material
            </button>
            <button onClick={() => setModal('ia')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10">
              <Sparkles size={14} /> Rascunhar com IA
            </button>
            <button onClick={() => router.push('/admin/vertho/modulos-base/novo')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-[#06172C]"
              style={{ background: 'linear-gradient(135deg,#34c5cc,#0D9488)' }}>
              <Plus size={14} /> Novo módulo
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <Select label="Status" value={filtroStatus} onChange={setFiltroStatus} options={STATUS} />
          <Select label="Idioma" value={filtroLocale} onChange={setFiltroLocale} options={LOCALES} />
          <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/45">
            Competência
            <select value={filtroComp} onChange={e => setFiltroComp(e.target.value)}
              className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[220px]">
              <option value="">Todas</option>
              {competencias.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/45">
            Busca
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="por título"
              className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[180px] placeholder:text-white/25" />
          </div>
          <button onClick={carregar}
            className="px-4 py-2 rounded-lg text-xs font-bold text-[#06172C]"
            style={{ background: 'linear-gradient(135deg,#34c5cc,#0D9488)' }}>
            Filtrar
          </button>
        </div>

        {erro && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 mb-4 text-sm text-amber-200">
            {erro}
          </div>
        )}

        {/* Tabela */}
        <div className="rounded-xl border border-white/[0.08] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-cyan-300" /></div>
          ) : modulos.length === 0 ? (
            <div className="py-16 text-center text-white/50 text-sm">Nenhum módulo encontrado com esses filtros.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/[0.03] text-white/45 uppercase text-[10px]">
                  <th className="px-3 py-2.5 text-left">Título</th>
                  <th className="px-3 py-2.5 text-left">Competência</th>
                  <th className="px-3 py-2.5 text-left">Descritor</th>
                  <th className="px-3 py-2.5">N→N</th>
                  <th className="px-3 py-2.5">Idioma</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Atualizado</th>
                  <th className="px-3 py-2.5">Autor</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {modulos.map(m => (
                  <tr key={m.id} className="border-t border-white/[0.04] hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => router.push(`/admin/vertho/modulos-base/${m.id}`)}>
                    <td className="px-3 py-2.5 text-white">
                      <div className="flex items-center gap-2">
                        {m.preferido && <Star size={11} className="text-amber-300" fill="currentColor" />}
                        <span className="truncate max-w-[280px]">{m.titulo}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-white/70 truncate max-w-[200px]">
                      {compMap[m.competencia_base_id]?.nome || m.competencia_nome || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-white/65 truncate max-w-[240px]" title={m.descritor || ''}>
                      {m.descritor || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono">{m.nivel_entrada}→{m.nivel_destino}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-white/70">{m.locale}</td>
                    <td className="px-3 py-2.5 text-center font-semibold" style={{ color: STATUS_COR[m.status] }}>{m.status}</td>
                    <td className="px-3 py-2.5 text-white/55 text-center">
                      {new Date(m.updated_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-3 py-2.5 text-white/55 truncate max-w-[160px]">{m.created_by}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={e => { e.stopPropagation(); setPreferido(m.id, !m.preferido).then(carregar); }}
                          className="text-[11px] text-cyan-300 hover:underline">
                          {m.preferido ? 'remover preferido' : 'tornar preferido'}
                        </button>
                        <button onClick={async e => {
                          e.stopPropagation();
                          const ok = window.confirm(`Excluir "${m.titulo}"? Esta ação não pode ser desfeita.`);
                          if (!ok) return;
                          const r = await excluirModulo(m.id);
                          if ('error' in r && r.error) alert(r.error);
                          else carregar();
                        }}
                          title="Excluir módulo"
                          disabled={m.status === 'publicado'}
                          className="text-red-300/70 hover:text-red-200 disabled:opacity-30 disabled:cursor-not-allowed">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal === 'ia' && (
        <ModalIA competencias={competencias} onClose={() => setModal(null)} onCriou={(id) => { setModal(null); router.push(`/admin/vertho/modulos-base/${id}`); }} />
      )}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-white/45">
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[120px]">
        <option value="">Todos</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ModalIA({ competencias, onClose, onCriou }: { competencias: any[]; onClose: () => void; onCriou: (id: string) => void }) {
  const [comp, setComp] = useState('');
  const [ne, setNe] = useState('N1'); const [nd, setNd] = useState('N2');
  const [locale, setLocale] = useState('pt-BR');
  const [contexto, setContexto] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  async function rascunhar() {
    setErro(''); setLoading(true);
    const r = await rascunharModuloBase({
      competencia_base_id: comp,
      nivel_entrada: ne as any, nivel_destino: nd as any,
      locale: locale as any, contexto_pedagogico: contexto || undefined,
    });
    setLoading(false);
    if ('error' in r && r.error) setErro(r.error);
    else if ('id' in r) onCriou(r.id);
  }

  return (
    <Modal title="Rascunhar com IA" onClose={onClose} bloqueado={loading}>
      <FieldCompetencia value={comp} onChange={setComp} options={competencias} />
      <FieldNiveis ne={ne} nd={nd} onNe={setNe} onNd={setNd} />
      <FieldLocale value={locale} onChange={setLocale} />
      <FieldContexto value={contexto} onChange={setContexto} />
      {erro && <p className="text-amber-300 text-xs">{erro}</p>}
      <p className="text-[11px] text-white/45">A IA gera um <strong>rascunho</strong> seguindo o template. Você revisa e ajusta antes de submeter.</p>
      <button disabled={loading || !comp} onClick={rascunhar}
        className="w-full py-2.5 rounded-xl font-bold text-sm text-[#06172C] disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg,#34c5cc,#0D9488)' }}>
        {loading ? 'Gerando…' : 'Rascunhar com IA'}
      </button>
    </Modal>
  );
}

function Modal({ title, children, onClose, bloqueado }: { title: string; children: React.ReactNode; onClose: () => void; bloqueado?: boolean }) {
  // Quando bloqueado=true (processando IA), clique fora e ESC NÃO fecham — evita
  // perder uma chamada cara/longa de IA por click acidental no overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !bloqueado) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bloqueado, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={() => { if (!bloqueado) onClose(); }}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-2xl border border-white/10 p-5 space-y-3 relative"
        style={{ background: '#0f1a33' }}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button onClick={onClose} disabled={bloqueado}
            className="w-7 h-7 rounded-md flex items-center justify-center text-white/45 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            title={bloqueado ? 'Aguarde o processamento terminar' : 'Fechar (Esc)'}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldCompetencia({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: any[] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] uppercase tracking-wide text-white/45">Competência base*</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
        <option value="">— selecione —</option>
        {options.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.segmento})</option>)}
      </select>
    </div>
  );
}

function FieldNiveis({ ne, nd, onNe, onNd }: { ne: string; nd: string; onNe: (v: string) => void; onNd: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-white/45">Nível entrada*</label>
        <select value={ne} onChange={e => onNe(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
          {NIVEIS.slice(0, 3).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-white/45">Nível destino*</label>
        <select value={nd} onChange={e => onNd(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
          {NIVEIS.slice(1).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}

function FieldLocale({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] uppercase tracking-wide text-white/45">Idioma*</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
        {LOCALES.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
    </div>
  );
}

function FieldContexto({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] uppercase tracking-wide text-white/45">Contexto pedagógico (opcional)</label>
      <input value={value} onChange={e => onChange(e.target.value)}
        placeholder="ex.: educacao-infantil"
        className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25" />
    </div>
  );
}
