import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import type { MunicipioCompacto } from '@/lib/radar/queries';

type Direction = 'higher_better' | 'lower_better' | 'neutral';

const FMT_BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
});

const ROWS: Array<{
  label: string;
  acessor: (m: MunicipioCompacto) => number | null;
  format: (v: number) => string;
  direction: Direction;
  group?: string;
}> = [
  { group: 'Aprendizagem', label: 'ICA · taxa de alfabetização',  acessor: (m) => m.icaTaxa, format: (v) => `${v.toFixed(1)}%`, direction: 'higher_better' },
  { label: 'Ideb · 5º ano EF',                                     acessor: (m) => m.ideb_5ef, format: (v) => v.toFixed(2), direction: 'higher_better' },
  { label: 'Ideb · 9º ano EF',                                     acessor: (m) => m.ideb_9ef, format: (v) => v.toFixed(2), direction: 'higher_better' },
  { label: 'Ideb · 3º ano EM',                                     acessor: (m) => m.ideb_3em, format: (v) => v.toFixed(2), direction: 'higher_better' },
  { label: 'Saeb LP · 5º EF (média municipal)',                    acessor: (m) => m.saeb_5ef_lp, format: (v) => v.toFixed(0), direction: 'higher_better' },
  { label: 'Saeb Mat · 5º EF',                                     acessor: (m) => m.saeb_5ef_mat, format: (v) => v.toFixed(0), direction: 'higher_better' },
  { label: 'Saeb LP · 9º EF',                                      acessor: (m) => m.saeb_9ef_lp, format: (v) => v.toFixed(0), direction: 'higher_better' },
  { label: 'Saeb Mat · 9º EF',                                     acessor: (m) => m.saeb_9ef_mat, format: (v) => v.toFixed(0), direction: 'higher_better' },
  { group: 'Recursos', label: 'FUNDEB · R$ por aluno-ano',         acessor: (m) => m.fundeb_aluno, format: (v) => FMT_BRL.format(v), direction: 'higher_better' },
  { label: 'VAAR · recebimento da União',                          acessor: (m) => m.vaar_recebimento, format: (v) => FMT_BRL.format(v), direction: 'higher_better' },
  { group: 'Cobertura', label: 'Escolas no Radar',                 acessor: (m) => m.totalEscolas, format: (v) => v.toLocaleString('pt-BR'), direction: 'neutral' },
];

export function CompararTabelaCidades({ cidades }: { cidades: MunicipioCompacto[] }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] overflow-hidden"
      style={{ background: '#0b1d36' }}>
      {/* Header com cidades */}
      <div className="grid border-b border-white/[0.08]"
        style={{ gridTemplateColumns: `200px repeat(${cidades.length}, 1fr)` }}>
        <div className="px-4 py-3 border-r border-white/[0.04]">
          <p className="text-[10px] tracking-[0.15em] uppercase font-mono text-white/40">Indicador</p>
        </div>
        {cidades.map((c) => (
          <div key={c.ibge} className="px-4 py-3 border-r border-white/[0.04] last:border-r-0">
            <Link href={`/radar/municipio/${c.ibge}`}
              className="text-sm font-bold text-white hover:text-cyan-400 inline-flex items-center gap-1 leading-tight">
              {c.nome.length > 36 ? c.nome.slice(0, 34) + '…' : c.nome}
              <ExternalLink size={11} className="opacity-50" />
            </Link>
            <p className="text-[10px] text-white/40 font-mono mt-1">
              IBGE {c.ibge} · {c.uf}
              {c.totalEscolas > 0 && ` · ${c.totalEscolas.toLocaleString('pt-BR')} esc.`}
            </p>
            {c.vaar_beneficiario != null && (
              <p className="text-[10px] mt-1.5">
                <span className="px-1.5 py-0.5 rounded font-bold"
                  style={{
                    background: c.vaar_beneficiario ? 'rgba(34,197,94,0.18)' : 'rgba(220,38,38,0.18)',
                    color: c.vaar_beneficiario ? '#86efac' : '#fca5a5',
                  }}>
                  VAAR · {c.vaar_beneficiario ? 'beneficiário' : 'não beneficiário'}
                </span>
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Linhas */}
      {ROWS.map((row, ri) => {
        const valores = cidades.map((c) => row.acessor(c));
        // Compara pelos valores APRESENTADOS (mesma precisão que o usuário vê).
        // Evita marcar 5.5925 como melhor que 5.5912 quando ambos exibem "5.59".
        const exibidos = valores.map((v) => v != null ? row.format(v) : null);
        let melhorStr: string | null = null;
        const definidos = valores.filter((v): v is number => v != null);
        if (row.direction !== 'neutral' && definidos.length > 1) {
          const melhorRaw = row.direction === 'higher_better' ? Math.max(...definidos) : Math.min(...definidos);
          melhorStr = row.format(melhorRaw);
          // Empate sob mesma precisão: todas as que casam ficam destacadas como "melhor".
          // Só suprime se TODAS empataram (não há diferenciação a fazer).
          const ocorrencias = exibidos.filter((s) => s === melhorStr).length;
          if (ocorrencias === exibidos.filter((s) => s != null).length) melhorStr = null;
        }

        return (
          <div key={ri}>
            {row.group && (
              <div className="px-4 py-2 border-y border-white/[0.06]"
                style={{ background: 'rgba(255,255,255,0.02)' }}>
                <p className="text-[10px] font-bold tracking-[0.18em] uppercase font-mono"
                  style={{ color: '#34c5cc' }}>
                  {row.group}
                </p>
              </div>
            )}
            <div className="grid border-b border-white/[0.04] last:border-b-0"
              style={{ gridTemplateColumns: `200px repeat(${cidades.length}, 1fr)` }}>
              <div className="px-4 py-3 text-xs text-white/65 border-r border-white/[0.04]">
                {row.label}
              </div>
              {cidades.map((c, ci) => {
                const v = valores[ci];
                const exibido = exibidos[ci];
                const isMelhor = melhorStr != null && exibido === melhorStr;
                return (
                  <div key={c.ibge}
                    className="px-4 py-3 border-r border-white/[0.04] last:border-r-0 font-mono text-sm"
                    style={{
                      background: isMelhor ? 'rgba(110,231,183,0.08)' : undefined,
                      color: isMelhor ? '#86efac' : (v == null ? 'rgba(255,255,255,0.3)' : '#fff'),
                      fontWeight: isMelhor ? 700 : 500,
                    }}>
                    {exibido ?? '—'}
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
