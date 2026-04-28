'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { buscarEscolasMunicipios } from '../actions';

type Result = {
  tipo: 'escola' | 'municipio';
  id: string;          // INEP ou IBGE
  label: string;       // nome
  sub?: string;        // município/UF, rede, etc
};

export function RadarSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await buscarEscolasMunicipios(q.trim());
      if (!cancelled) {
        setItems(r);
        setOpen(true);
        setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handlePick(item: Result) {
    if (item.tipo === 'escola') {
      router.push(`/escola/${item.id}`);
    } else {
      router.push(`/municipio/${item.id}`);
    }
  }

  return (
    <div ref={containerRef} className="relative max-w-[640px] mx-auto">
      <div
        className="flex items-center gap-3 px-5 py-4 rounded-2xl border"
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderColor: 'rgba(52,197,204,0.18)',
          boxShadow: '0 12px 40px -12px rgba(52,197,204,0.18)',
        }}
      >
        <Search size={18} style={{ color: '#34c5cc' }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          placeholder="Buscar escola, INEP ou município"
          className="flex-1 bg-transparent text-white text-base outline-none placeholder:text-white/35"
        />
        {loading && <Loader2 size={16} className="animate-spin text-cyan-400" />}
      </div>

      {open && items.length > 0 && (
        <div
          className="absolute left-0 right-0 mt-2 rounded-xl overflow-hidden border z-20 text-left"
          style={{
            background: '#0b1d36',
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          {items.map((item) => (
            <button
              key={`${item.tipo}-${item.id}`}
              onClick={() => handlePick(item)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
            >
              <span
                className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded"
                style={{
                  background: item.tipo === 'escola' ? 'rgba(52,197,204,0.15)' : 'rgba(154,226,230,0.12)',
                  color: item.tipo === 'escola' ? '#34c5cc' : '#9ae2e6',
                }}
              >
                {item.tipo}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{item.label}</p>
                {item.sub && <p className="text-[11px] text-white/45 truncate">{item.sub}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && items.length === 0 && q.trim().length >= 2 && !loading && (
        <div
          className="absolute left-0 right-0 mt-2 rounded-xl border px-4 py-3 z-20"
          style={{ background: '#0b1d36', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <p className="text-xs text-white/50">Nenhum resultado para "{q}".</p>
        </div>
      )}
    </div>
  );
}
