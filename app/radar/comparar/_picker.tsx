'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Search, Loader2, GraduationCap, MapPin } from 'lucide-react';
import { buscarEscolasMunicipios } from '../actions';

const MAX_ITEMS = 4;

export type CompararModo = 'escolas' | 'cidades';

export type ItemSelecionado = { id: string; nome: string; uf?: string | null };

export function CompararPicker({
  codigosAtuais,
  modo,
  itensSelecionados,
}: {
  codigosAtuais: string[];
  modo: CompararModo;
  itensSelecionados?: ItemSelecionado[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<{ tipo: string; id: string; label: string; sub?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const tipoFiltro = modo === 'escolas' ? 'escola' : 'municipio';

  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await buscarEscolasMunicipios(q.trim());
      if (!cancelled) {
        setItems(r.filter((x) => x.tipo === tipoFiltro && !codigosAtuais.includes(x.id)));
        setLoading(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, codigosAtuais, tipoFiltro]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function navigate(codes: string[], targetMode: CompararModo) {
    const params = new URLSearchParams();
    params.set('modo', targetMode);
    if (codes.length) {
      const key = targetMode === 'escolas' ? 'escolas' : 'ibges';
      params.set(key, codes.join(','));
    }
    router.push(`/radar/comparar?${params.toString()}`);
  }

  function trocarModo(novoModo: CompararModo) {
    if (novoModo === modo) return;
    // Trocar de modo limpa as seleções (escolas e cidades não compartilham IDs)
    navigate([], novoModo);
  }

  function adicionar(id: string) {
    if (codigosAtuais.includes(id)) return;
    const novo = [...codigosAtuais, id].slice(0, MAX_ITEMS);
    navigate(novo, modo);
    setQ('');
    setAberto(false);
  }

  function remover(id: string) {
    navigate(codigosAtuais.filter((c) => c !== id), modo);
  }

  const cheio = codigosAtuais.length >= MAX_ITEMS;
  const placeholder = modo === 'escolas'
    ? 'Buscar escola por nome ou INEP'
    : 'Buscar município por nome ou IBGE';
  const labelChip = modo === 'escolas' ? 'INEP' : 'IBGE';
  const labelBotao = modo === 'escolas' ? 'Adicionar escola' : 'Adicionar cidade';
  const limiteLabel = modo === 'escolas'
    ? `Limite de ${MAX_ITEMS} escolas atingido`
    : `Limite de ${MAX_ITEMS} cidades atingido`;

  return (
    <div className="mb-6">
      {/* Toggle de modo */}
      <div className="inline-flex rounded-xl border border-white/[0.08] p-1 mb-5"
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <button onClick={() => trocarModo('escolas')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
          style={{
            background: modo === 'escolas' ? 'rgba(52,197,204,0.15)' : 'transparent',
            color: modo === 'escolas' ? '#34c5cc' : 'rgba(255,255,255,0.55)',
            border: modo === 'escolas' ? '1px solid rgba(52,197,204,0.3)' : '1px solid transparent',
          }}>
          <GraduationCap size={14} />
          Escolas
        </button>
        <button onClick={() => trocarModo('cidades')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
          style={{
            background: modo === 'cidades' ? 'rgba(52,197,204,0.15)' : 'transparent',
            color: modo === 'cidades' ? '#34c5cc' : 'rgba(255,255,255,0.55)',
            border: modo === 'cidades' ? '1px solid rgba(52,197,204,0.3)' : '1px solid transparent',
          }}>
          <MapPin size={14} />
          Cidades
        </button>
      </div>

      {/* Chips dos itens atuais */}
      {codigosAtuais.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {codigosAtuais.map((c) => {
            const item = itensSelecionados?.find((x) => x.id === c);
            const label = item?.nome || `${labelChip} ${c}`;
            return (
              <span key={c}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] border max-w-full"
                style={{ background: 'rgba(52,197,204,0.08)', borderColor: 'rgba(52,197,204,0.22)', color: '#9ae2e6' }}>
                <span className="font-medium truncate">{label}</span>
                {item?.uf && <span className="text-white/45 font-mono text-[10px]">{item.uf}</span>}
                <button onClick={() => remover(c)} className="ml-1 hover:text-white shrink-0">
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Botão + busca */}
      <div ref={containerRef} className="relative">
        {!aberto ? (
          <button onClick={() => !cheio && setAberto(true)} disabled={cheio}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white border transition-colors disabled:opacity-40"
            style={{ borderColor: 'rgba(52,197,204,0.32)', background: 'rgba(52,197,204,0.06)' }}>
            <Plus size={14} />
            {cheio ? limiteLabel : labelBotao}
          </button>
        ) : (
          <>
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl border"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(52,197,204,0.18)' }}
            >
              <Search size={16} style={{ color: '#34c5cc' }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/30" />
              {loading && <Loader2 size={14} className="animate-spin text-cyan-400" />}
            </div>

            {items.length > 0 && (
              <div className="absolute left-0 right-0 mt-2 rounded-xl border z-20 overflow-hidden"
                style={{ background: '#0b1d36', borderColor: 'rgba(255,255,255,0.08)' }}>
                {items.map((it) => (
                  <button key={it.id} onClick={() => adicionar(it.id)}
                    className="w-full text-left px-4 py-3 hover:bg-white/[0.04] transition-colors border-b border-white/[0.04] last:border-b-0">
                    <p className="text-sm text-white">{it.label}</p>
                    {it.sub && <p className="text-[11px] text-white/45">{it.sub}</p>}
                  </button>
                ))}
              </div>
            )}
            {q.trim().length >= 2 && !loading && items.length === 0 && (
              <div className="absolute left-0 right-0 mt-2 rounded-xl border px-4 py-3 z-20"
                style={{ background: '#0b1d36', borderColor: 'rgba(255,255,255,0.08)' }}>
                <p className="text-xs text-white/50">Nada encontrado.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
