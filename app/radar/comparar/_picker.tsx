'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Search, Loader2 } from 'lucide-react';
import { buscarEscolasMunicipios } from '../actions';

const MAX_ITEMS = 4;

export function CompararPicker({ codigosAtuais }: { codigosAtuais: string[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<{ tipo: string; id: string; label: string; sub?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await buscarEscolasMunicipios(q.trim());
      if (!cancelled) {
        setItems(r.filter((x) => x.tipo === 'escola' && !codigosAtuais.includes(x.id)));
        setLoading(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, codigosAtuais]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function navigate(codes: string[]) {
    const params = new URLSearchParams();
    if (codes.length) params.set('escolas', codes.join(','));
    router.push(`/comparar${params.toString() ? `?${params}` : ''}`);
  }

  function adicionar(inep: string) {
    if (codigosAtuais.includes(inep)) return;
    const novo = [...codigosAtuais, inep].slice(0, MAX_ITEMS);
    navigate(novo);
    setQ('');
    setAberto(false);
  }

  function remover(inep: string) {
    navigate(codigosAtuais.filter((c) => c !== inep));
  }

  const cheio = codigosAtuais.length >= MAX_ITEMS;

  return (
    <div className="mb-6">
      {/* Chips das escolas atuais */}
      {codigosAtuais.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {codigosAtuais.map((c) => (
            <span key={c}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono border"
              style={{ background: 'rgba(52,197,204,0.08)', borderColor: 'rgba(52,197,204,0.22)', color: '#9ae2e6' }}>
              INEP {c}
              <button onClick={() => remover(c)} className="ml-1 hover:text-white">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Botão + busca */}
      <div ref={containerRef} className="relative">
        {!aberto ? (
          <button onClick={() => !cheio && setAberto(true)} disabled={cheio}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white border transition-colors disabled:opacity-40"
            style={{ borderColor: 'rgba(52,197,204,0.32)', background: 'rgba(52,197,204,0.06)' }}>
            <Plus size={14} />
            {cheio ? `Limite de ${MAX_ITEMS} escolas atingido` : 'Adicionar escola'}
          </button>
        ) : (
          <>
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl border"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(52,197,204,0.18)' }}
            >
              <Search size={16} style={{ color: '#34c5cc' }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar escola ou INEP"
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
