'use client';

import { useState } from 'react';
import { BookText, Copy, Check, X } from 'lucide-react';

type Props = {
  scopeType: 'escola' | 'municipio' | 'estado';
  scopeId: string;
  scopeLabel: string;
  geradoEm?: string;
};

const FORMATOS = [
  { id: 'abnt', label: 'ABNT' },
  { id: 'apa', label: 'APA' },
  { id: 'bibtex', label: 'BibTeX' },
] as const;

type FormatoId = typeof FORMATOS[number]['id'];

export function CitarButton({ scopeType, scopeId, scopeLabel, geradoEm }: Props) {
  const [open, setOpen] = useState(false);
  const [copiado, setCopiado] = useState<FormatoId | null>(null);

  const url =
    scopeType === 'escola' ? `https://radar.vertho.ai/escola/${scopeId}` :
    scopeType === 'municipio' ? `https://radar.vertho.ai/municipio/${scopeId}` :
    `https://radar.vertho.ai/estado/${scopeId}`;

  const dataAcesso = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const ano = new Date().getFullYear();

  const citacoes: Record<FormatoId, string> = {
    abnt: `VERTHO MENTOR IA. Radar Vertho — ${scopeLabel}. ${ano}. Disponível em: <${url}>. Acesso em: ${dataAcesso}.`,
    apa: `Vertho Mentor IA. (${ano}). Radar Vertho — ${scopeLabel}. Recuperado de ${url}`,
    bibtex: `@misc{vertho_radar_${scopeId},
  author       = {{Vertho Mentor IA}},
  title        = {Radar Vertho --- ${scopeLabel}},
  year         = {${ano}},
  url          = {${url}},
  note         = {Acesso em ${dataAcesso}}
}`,
  };

  async function copiar(id: FormatoId) {
    try {
      await navigator.clipboard.writeText(citacoes[id]);
      setCopiado(id);
      setTimeout(() => setCopiado((c) => c === id ? null : c), 2000);
    } catch {}
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors"
        style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.02)' }}>
        <BookText size={12} />
        Citar este Radar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-xl rounded-2xl border p-6 relative"
            style={{ background: '#0a1f3a', borderColor: 'rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(false)}
              className="absolute right-4 top-4 text-white/40 hover:text-white">
              <X size={18} />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">Citar este Radar</h3>
            <p className="text-xs text-white/55 mb-5">
              Copie a citação em ABNT, APA ou BibTeX.
            </p>

            <div className="space-y-4">
              {FORMATOS.map((f) => (
                <div key={f.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] tracking-widest uppercase font-mono" style={{ color: '#34c5cc' }}>
                      {f.label}
                    </span>
                    <button onClick={() => copiar(f.id)}
                      className="inline-flex items-center gap-1.5 text-[11px] text-white/55 hover:text-white">
                      {copiado === f.id ? (
                        <><Check size={12} className="text-emerald-400" /> Copiado!</>
                      ) : (
                        <><Copy size={12} /> Copiar</>
                      )}
                    </button>
                  </div>
                  <pre className="text-[11px] text-white/80 leading-relaxed whitespace-pre-wrap rounded-lg p-3 border border-white/[0.06]"
                    style={{ background: 'rgba(255,255,255,0.03)', fontFamily: 'var(--font-mono, monospace)' }}>
                    {citacoes[f.id]}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
