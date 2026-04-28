import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { EscolaCompacta } from '@/lib/radar/queries';

type Direction = 'higher_better' | 'lower_better';

const ROWS: Array<{
  label: string;
  acessor: (e: EscolaCompacta) => number | null;
  format: (v: number) => string;
  direction: Direction;
  group?: string;
}> = [
  { group: 'Saeb', label: '% nos níveis 0-1 (insuficiente)', acessor: (e) => e.saebPctNivel01, format: (v) => `${v.toFixed(1)}%`, direction: 'lower_better' },
  { label: 'Taxa de participação', acessor: (e) => e.saebTaxaPart, format: (v) => `${v.toFixed(1)}%`, direction: 'higher_better' },
  { label: 'Formação docente', acessor: (e) => e.saebFormacao, format: (v) => `${v.toFixed(1)}%`, direction: 'higher_better' },
  { group: 'Censo Escolar', label: 'Infra Básica', acessor: (e) => e.scoreBasica, format: (v) => `${v.toFixed(0)}/100`, direction: 'higher_better' },
  { label: 'Infra Pedagógica', acessor: (e) => e.scorePedagogica, format: (v) => `${v.toFixed(0)}/100`, direction: 'higher_better' },
  { label: 'Acessibilidade', acessor: (e) => e.scoreAcessibilidade, format: (v) => `${v.toFixed(0)}/100`, direction: 'higher_better' },
  { label: 'Conectividade', acessor: (e) => e.scoreConectividade, format: (v) => `${v.toFixed(0)}/100`, direction: 'higher_better' },
];

export function CompararTabela({ escolas }: { escolas: EscolaCompacta[] }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
      style={{ background: '#0b1d36' }}>
      {/* Header com escolas */}
      <div className="grid border-b border-white/[0.06]"
        style={{ gridTemplateColumns: `200px repeat(${escolas.length}, 1fr)` }}>
        <div className="px-4 py-3 border-r border-white/[0.04]">
          <p className="text-[10px] tracking-widest uppercase font-mono text-white/40">Indicador</p>
        </div>
        {escolas.map((e) => (
          <div key={e.codigo_inep} className="px-4 py-3 border-r border-white/[0.04] last:border-r-0">
            <Link href={`/escola/${e.codigo_inep}`}
              className="text-sm font-bold text-white hover:text-cyan-400 inline-flex items-center gap-1 leading-tight">
              {e.nome.length > 36 ? e.nome.slice(0, 34) + '…' : e.nome}
              <ExternalLink size={11} className="opacity-50" />
            </Link>
            <p className="text-[10px] text-white/40 font-mono mt-1">
              {e.municipio}/{e.uf}
              {e.rede && ` · ${e.rede}`}
              {e.inse_grupo != null && ` · INSE ${e.inse_grupo}`}
            </p>
          </div>
        ))}
      </div>

      {/* Linhas */}
      {ROWS.map((row, ri) => {
        const valores = escolas.map((e) => row.acessor(e));
        const definidos = valores.filter((v): v is number => v != null);
        const melhor = definidos.length > 0
          ? (row.direction === 'higher_better' ? Math.max(...definidos) : Math.min(...definidos))
          : null;

        return (
          <div key={ri}>
            {row.group && (
              <div className="px-4 py-2 bg-white/[0.02] border-y border-white/[0.04]">
                <p className="text-[10px] font-bold tracking-widest uppercase font-mono" style={{ color: '#34c5cc' }}>
                  {row.group}
                </p>
              </div>
            )}
            <div className="grid border-b border-white/[0.04] last:border-b-0"
              style={{ gridTemplateColumns: `200px repeat(${escolas.length}, 1fr)` }}>
              <div className="px-4 py-3 text-xs text-white/65 border-r border-white/[0.04]">
                {row.label}
              </div>
              {escolas.map((e, ei) => {
                const v = valores[ei];
                const isMelhor = v != null && v === melhor && definidos.length > 1;
                return (
                  <div key={e.codigo_inep}
                    className="px-4 py-3 border-r border-white/[0.04] last:border-r-0 font-mono text-sm"
                    style={{
                      background: isMelhor ? 'rgba(52,211,153,0.08)' : undefined,
                      color: isMelhor ? '#34D399' : (v == null ? 'rgba(255,255,255,0.3)' : '#fff'),
                      fontWeight: isMelhor ? 700 : 500,
                    }}>
                    {v != null ? row.format(v) : '—'}
                    {isMelhor && (
                      <span className="ml-2 text-[9px] uppercase tracking-wider opacity-70">melhor</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
