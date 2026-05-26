'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Filter, ChevronRight, Search, CheckCircle2 } from 'lucide-react';
import { empresaGlyph, fmtNum, serifStyle as serif, monoStyle as mono } from './nav-items';

export default function EmpresaFilter({ empresas, value, onChange, t, locale }: { empresas: any[]; value: string; onChange: (v: string) => void; t: any; locale: string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Calcula posição do dropdown baseado no trigger (e reajusta em scroll/resize)
  useEffect(() => {
    if (!open) return;
    function updateCoords() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    updateCoords();
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [open]);

  // Click outside fecha
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return empresas;
    return empresas.filter((e: any) => (e.nome || '').toLowerCase().includes(q));
  }, [empresas, search]);

  const empresaAtual = empresas.find((e: any) => e.id === value);
  const label = empresaAtual?.nome || t('companyFilter.all');
  const isAll = value === 'all';

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all"
        style={{
          background: isAll ? 'rgba(255,255,255,.04)' : 'rgba(52,197,204,.1)',
          border: `1px solid ${isAll ? 'rgba(255,255,255,.1)' : 'rgba(52,197,204,.3)'}`,
          color: isAll ? 'rgba(255,255,255,.85)' : '#34c5cc',
          minWidth: 200,
        }}
      >
        {isAll ? <Globe size={13} /> : <Filter size={13} />}
        <span className="flex-1 text-left truncate font-bold">{label}</span>
        <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {mounted && open && createPortal(
        <div
          ref={dropdownRef}
          className="rounded-xl shadow-2xl"
          style={{
            position: 'fixed',
            top: coords.top,
            right: coords.right,
            width: 280,
            zIndex: 1000,
            background: 'rgba(9,29,56,.98)',
            border: '1px solid rgba(255,255,255,.1)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="p-2" style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,.4)' }} />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('companyFilter.search')}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none"
                style={{ background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.08)', color: '#fff' }}
              />
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto py-1">
            <button
              onClick={() => { onChange('all'); setOpen(false); setSearch(''); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-white/5"
              style={{ color: isAll ? '#34c5cc' : 'rgba(255,255,255,.85)' }}
            >
              <Globe size={14} />
              <span className="flex-1 font-bold">{t('companyFilter.all')}</span>
              {isAll && <CheckCircle2 size={13} />}
            </button>

            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-center" style={{ color: 'rgba(255,255,255,.4)' }}>{t('companyFilter.empty')}</p>
            ) : (
              filtered.map((emp: any) => {
                const selected = emp.id === value;
                return (
                  <button
                    key={emp.id}
                    onClick={() => { onChange(emp.id); setOpen(false); setSearch(''); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-white/5"
                    style={{ color: selected ? '#34c5cc' : 'rgba(255,255,255,.85)' }}
                  >
                    <span style={{ ...serif, fontSize: 14, color: selected ? '#34c5cc' : 'rgba(255,255,255,.55)' }}>
                      {empresaGlyph(emp.nome)}
                    </span>
                    <span className="flex-1 truncate">{emp.nome}</span>
                    <span style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,.4)' }}>{fmtNum(emp.totalColab, locale)}</span>
                    {selected && <CheckCircle2 size={13} />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
