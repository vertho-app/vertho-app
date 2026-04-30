'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, ArrowRight, MapPin, GraduationCap } from 'lucide-react';
import { buscarEscolasMunicipios } from '../../radar/actions';
import { track } from '../_lib/tracking';

type SearchResult = {
  tipo: 'escola' | 'municipio';
  id: string;
  label: string;
  sub?: string;
};

/**
 * Componente de busca do radarbett — versão consultiva.
 * - Hint em vez de placeholder técnico
 * - Resultado vai pra /radarbett/escola/[inep] ou /radarbett/municipio/[ibge]
 * - Tracking: search_focus, search_submit
 */
export function BettSearch({
  size = 'normal',
  onSelectResult,
}: {
  size?: 'normal' | 'large';
  onSelectResult?: (r: SearchResult) => void;
}) {
  const router = useRouter();
  const [termo, setTermo] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const focusedOnce = useRef(false);
  const debounce = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!termo || termo.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      const r = await buscarEscolasMunicipios(termo);
      setResults(r || []);
      setOpen(true);
      setLoading(false);
    }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [termo]);

  function handleFocus() {
    setFocused(true);
    if (!focusedOnce.current) {
      track('bett_search_focus');
      focusedOnce.current = true;
    }
  }

  function handleSelect(r: SearchResult) {
    track('bett_search_submit', { tipo: r.tipo as any, id: r.id });
    if (onSelectResult) {
      onSelectResult(r);
      return;
    }
    setOpen(false);
    if (r.tipo === 'escola') router.push(`/escola/${r.id}`);
    else router.push(`/municipio/${r.id}`);
  }

  const isLarge = size === 'large';

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div
        className={`relative flex items-center rounded-full transition-all ${
          isLarge ? 'h-14 sm:h-16' : 'h-12'
        } ${focused ? 'ring-2 ring-cyan-400/40' : ''}`}
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: focused ? '0 14px 40px rgba(52,197,204,0.15)' : '0 6px 20px rgba(0,0,0,0.2)',
        }}
      >
        <Search
          size={isLarge ? 18 : 16}
          className={`text-white/40 absolute ${isLarge ? 'left-5' : 'left-4'}`}
        />
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onFocus={handleFocus}
          onBlur={() => setFocused(false)}
          placeholder="Digite o nome da escola ou município"
          className={`w-full bg-transparent text-white placeholder:text-white/40 outline-none ${
            isLarge ? 'text-base sm:text-lg pl-12 sm:pl-14 pr-32 sm:pr-40' : 'text-sm pl-11 pr-28'
          }`}
        />
        {loading && (
          <Loader2
            size={isLarge ? 16 : 14}
            className={`absolute ${isLarge ? 'right-32 sm:right-40' : 'right-28'} text-cyan-400 animate-spin`}
          />
        )}
        <button
          type="button"
          aria-label="Buscar"
          onClick={() => {
            if (results.length > 0) handleSelect(results[0]);
          }}
          disabled={!termo || results.length === 0}
          className={`absolute ${
            isLarge ? 'right-2 px-4 sm:px-5 h-10 sm:h-12 text-sm' : 'right-1.5 px-3 h-9 text-[12px]'
          } rounded-full font-bold transition-all disabled:opacity-40`}
          style={{
            background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)',
            color: '#06172C',
          }}
        >
          {isLarge ? 'Gerar diagnóstico inicial' : 'Gerar leitura'}
        </button>
      </div>

      {open && results.length > 0 && (
        <div
          className="absolute top-full left-0 right-0 mt-2 rounded-2xl border overflow-hidden z-40 max-h-[320px] overflow-y-auto"
          style={{
            background: 'linear-gradient(180deg, #0c2848, #091D35)',
            borderColor: 'rgba(52,197,204,0.18)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.4)',
          }}
        >
          {results.map((r) => (
            <button
              key={`${r.tipo}-${r.id}`}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/[0.05] transition-colors border-b border-white/[0.04] last:border-0"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: r.tipo === 'escola' ? 'rgba(52,197,204,0.12)' : 'rgba(154,226,230,0.12)',
                }}
              >
                {r.tipo === 'escola' ? (
                  <GraduationCap size={14} style={{ color: '#34c5cc' }} />
                ) : (
                  <MapPin size={14} style={{ color: '#9ae2e6' }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{r.label}</p>
                {r.sub && <p className="text-[11px] text-white/45 truncate">{r.sub}</p>}
              </div>
              <ArrowRight size={12} className="text-white/30 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
