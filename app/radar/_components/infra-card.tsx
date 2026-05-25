import { SCORE_LABELS, SCORE_DESCRIPTIONS, type ScoreKey } from '@/lib/radar/censo-scores';
import type { CensoInfra } from '@/lib/radar/queries';

function scoreClassificacao(score: number | null): { label: string; color: string } {
  if (score == null) return { label: 'sem dado', color: 'rgba(255,255,255,0.3)' };
  if (score >= 75) return { label: 'boa', color: '#16a34a' };
  if (score >= 50) return { label: 'regular', color: '#d97706' };
  if (score >= 25) return { label: 'precária', color: '#ea580c' };
  return { label: 'crítica', color: '#dc2626' };
}

function Ring({ value, color }: { value: number | null; color: string }) {
  const v = value ?? 0;
  const r = 42;
  const C = 2 * Math.PI * r; // circumference
  const offset = C * (1 - v / 100);
  return (
    <div className="relative mx-auto" style={{ width: 100, height: 100 }}>
      <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C.toFixed(2)} strokeDashoffset={offset.toFixed(2)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-white"
          style={{
            fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
            fontSize: 28, fontWeight: 600, lineHeight: 1,
          }}>
          {value != null ? value.toFixed(0) : '—'}
        </p>
        <p className="text-[11px] text-white/40">/ 100</p>
      </div>
    </div>
  );
}

export function InfraSection({ censo }: { censo: CensoInfra }) {
  const scores: { k: ScoreKey; v: number | null }[] = [
    { k: 'basica', v: censo.score_basica },
    { k: 'pedagogica', v: censo.score_pedagogica },
    { k: 'acessibilidade', v: censo.score_acessibilidade },
    { k: 'conectividade', v: censo.score_conectividade },
  ];

  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        Censo Escolar {censo.ano}
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        Infraestrutura: onde a escola tem força e onde tem buraco
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
        Quatro dimensões avaliadas a partir de itens declarados no Censo Escolar. Quanto mais
        próximo de 100, mais completa a estrutura.
        {censo.zona_localizacao && (
          <span className="text-white/45"> · Zona {censo.zona_localizacao.toLowerCase()}.</span>
        )}
      </p>

      {censo.matriculas != null && (
        <div className="flex items-center gap-4 rounded-2xl px-6 py-4 mb-6 border border-white/[0.08]"
          style={{ background: 'rgba(52,197,204,0.08)' }}>
          <p className="text-white shrink-0"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 600, lineHeight: 1,
            }}>
            {censo.matriculas.toLocaleString('pt-BR')}
          </p>
          <p className="text-white/65 leading-snug" style={{ fontSize: 14 }}>
            alunos matriculados na educação básica
            <span className="text-white/40"> · total declarado no Censo Escolar {censo.ano}</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {scores.map(({ k, v }) => {
          const cls = scoreClassificacao(v);
          return (
            <div key={k}
              className="rounded-2xl p-6 border border-white/[0.08] flex flex-col items-center text-center"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-[10px] tracking-[0.1em] uppercase font-bold text-white/55 mb-3">
                {SCORE_LABELS[k]}
              </p>
              <Ring value={v} color={cls.color} />
              <p className="text-[11px] mt-3 font-bold uppercase tracking-[0.06em]" style={{ color: cls.color }}>
                {cls.label}
              </p>
              <p className="text-[12px] text-white/55 mt-2 leading-relaxed">
                {SCORE_DESCRIPTIONS[k]}
              </p>
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
  // Cada item considera múltiplas variáveis Censo via OR — uma escola pode
  // declarar a presença de "água da rede" sem marcar "potável" e ainda ter
  // água, por exemplo. A label reflete o que está sendo testado.
  const destaque: { keys: string[]; label: string }[] = [
    { keys: ['IN_BIBLIOTECA', 'IN_BIBLIOTECA_SALA_LEITURA', 'IN_SALA_LEITURA'],         label: 'Biblioteca ou sala de leitura' },
    { keys: ['IN_LABORATORIO_INFORMATICA'],                                              label: 'Laboratório de informática' },
    { keys: ['IN_LABORATORIO_CIENCIAS'],                                                 label: 'Laboratório de ciências' },
    { keys: ['IN_QUADRA_ESPORTES', 'IN_QUADRA_ESPORTES_COBERTA', 'IN_PATIO_COBERTO'],    label: 'Quadra ou pátio coberto' },
    { keys: ['IN_INTERNET'],                                                             label: 'Internet' },
    { keys: ['IN_INTERNET_APRENDIZAGEM'],                                                label: 'Internet pedagógica' },
    { keys: ['IN_BANDA_LARGA'],                                                          label: 'Banda larga' },
    { keys: ['IN_AGUA_POTAVEL', 'IN_AGUA_REDE_PUBLICA'],                                 label: 'Água da rede pública' },
    { keys: ['IN_ENERGIA_REDE_PUBLICA'],                                                 label: 'Energia da rede pública' },
    { keys: ['IN_ESGOTO_REDE_PUBLICA'],                                                  label: 'Esgoto da rede pública' },
    { keys: ['IN_ACESSIBILIDADE_RAMPAS'],                                                label: 'Rampas de acessibilidade' },
    { keys: ['IN_REFEITORIO', 'IN_COZINHA'],                                             label: 'Refeitório ou cozinha' },
  ];

  // Filtra itens onde pelo menos UMA das chaves existe no objeto Censo
  // (mesmo que o valor seja 0 — isso indica que o campo foi medido).
  const items = destaque.filter((d) => d.keys.some((k) => k in indicadores));
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl p-6 border border-white/[0.08]"
      style={{ background: 'rgba(255,255,255,0.04)' }}>
      <p className="text-sm font-bold text-white mb-4">Recursos disponíveis</p>
      <div className="flex flex-wrap gap-2">
        {items.map(({ keys, label }) => {
          // Tem se QUALQUER das chaves estiver marcada
          const has = keys.some((k) => Number(indicadores[k]) > 0);
          return (
            <span key={label}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-semibold"
              style={
                has
                  ? {
                      background: 'rgba(52,197,204,0.15)',
                      color: '#34c5cc',
                      border: '1px solid rgba(52,197,204,0.3)',
                    }
                  : {
                      background: 'rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.35)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      textDecoration: 'line-through',
                    }
              }>
              {has ? '✓' : '✗'} {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
