import { Wrench } from 'lucide-react';
import { SCORE_LABELS, SCORE_DESCRIPTIONS, type ScoreKey } from '@/lib/radar/censo-scores';
import type { CensoInfra } from '@/lib/radar/queries';

const SCORE_COR: Record<ScoreKey, string> = {
  basica: '#34D399',
  pedagogica: '#34c5cc',
  acessibilidade: '#9ae2e6',
  conectividade: '#A78BFA',
};

function scoreClassificacao(score: number | null): { label: string; color: string } {
  if (score == null) return { label: 'sem dado', color: 'rgba(255,255,255,0.3)' };
  if (score >= 75) return { label: 'boa', color: '#34D399' };
  if (score >= 50) return { label: 'regular', color: '#F4B740' };
  if (score >= 25) return { label: 'precária', color: '#F97354' };
  return { label: 'crítica', color: '#EF4444' };
}

export function InfraSection({ censo }: { censo: CensoInfra }) {
  const scores: { k: ScoreKey; v: number | null }[] = [
    { k: 'basica', v: censo.score_basica },
    { k: 'pedagogica', v: censo.score_pedagogica },
    { k: 'acessibilidade', v: censo.score_acessibilidade },
    { k: 'conectividade', v: censo.score_conectividade },
  ];

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white text-xl font-bold flex items-center gap-2">
          <Wrench size={18} style={{ color: '#34c5cc' }} />
          Infraestrutura · Censo Escolar {censo.ano}
        </h2>
        {censo.zona_localizacao && (
          <span className="text-[10px] tracking-widest uppercase font-mono text-white/45">
            Zona {censo.zona_localizacao.toLowerCase()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {scores.map(({ k, v }) => {
          const cls = scoreClassificacao(v);
          return (
            <div key={k}
              className="rounded-2xl p-4 border border-white/[0.06]"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-[9px] tracking-[0.18em] uppercase font-mono mb-1" style={{ color: SCORE_COR[k] }}>
                {SCORE_LABELS[k]}
              </p>
              <p className="text-3xl font-bold text-white font-mono leading-none mt-2">
                {v != null ? v.toFixed(0) : '—'}
                {v != null && <span className="text-base text-white/35 ml-1">/100</span>}
              </p>
              <p className="text-[10px] mt-2 font-bold uppercase tracking-wider" style={{ color: cls.color }}>
                {cls.label}
              </p>
              {/* Barra */}
              <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${v ?? 0}%`, background: SCORE_COR[k] }} />
              </div>
              <p className="text-[10px] text-white/40 mt-3 leading-relaxed">{SCORE_DESCRIPTIONS[k]}</p>
            </div>
          );
        })}
      </div>

      {/* Indicadores destacados (presença) */}
      <InfraDestaques indicadores={censo.indicadores} />
    </section>
  );
}

function InfraDestaques({ indicadores }: { indicadores: Record<string, number> }) {
  const destaque: { key: string; label: string }[] = [
    { key: 'IN_BIBLIOTECA', label: 'Biblioteca' },
    { key: 'IN_LABORATORIO_INFORMATICA', label: 'Lab. Informática' },
    { key: 'IN_LABORATORIO_CIENCIAS', label: 'Lab. Ciências' },
    { key: 'IN_QUADRA_ESPORTES', label: 'Quadra' },
    { key: 'IN_INTERNET', label: 'Internet' },
    { key: 'IN_INTERNET_APRENDIZAGEM', label: 'Internet pra aluno' },
    { key: 'IN_BANDA_LARGA', label: 'Banda larga' },
    { key: 'IN_AGUA_POTAVEL', label: 'Água potável' },
    { key: 'IN_ENERGIA_REDE_PUBLICA', label: 'Energia rede pública' },
    { key: 'IN_ESGOTO_REDE_PUBLICA', label: 'Esgoto rede pública' },
    { key: 'IN_ACESSIBILIDADE_RAMPAS', label: 'Rampas' },
    { key: 'IN_REFEITORIO', label: 'Refeitório' },
  ];

  const items = destaque.filter((d) => d.key in indicadores);
  if (items.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl p-4 border border-white/[0.06]"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <p className="text-[10px] tracking-[0.18em] uppercase font-mono text-white/45 mb-3">
        Recursos disponíveis
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        {items.map(({ key, label }) => {
          const has = indicadores[key] > 0;
          return (
            <div key={key} className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: has ? '#34D399' : 'rgba(255,255,255,0.08)', boxShadow: has ? '0 0 6px rgba(52,211,153,0.4)' : 'none' }}
              />
              <span className={has ? 'text-white/80' : 'text-white/35 line-through'}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
