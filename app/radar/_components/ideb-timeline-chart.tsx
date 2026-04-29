import type { IdebSnapshot } from '@/lib/radar/queries';

const ETAPA_LABEL: Record<string, string> = {
  '5_EF': '5º ano EF',
  '9_EF': '9º ano EF',
  '3_EM': '3º ano EM',
};

export function IdebTimelineChart({
  ideb,
  microIdeb,
  preferredEtapa,
}: {
  ideb: IdebSnapshot[];
  /** Média Ideb da microrregião pra mesma etapa */
  microIdeb?: number | null;
  preferredEtapa?: string;
}) {
  if (!ideb.length) return null;

  // Detecta etapa: prefere a passada, senão a com mais dados
  let etapa = preferredEtapa;
  if (!etapa) {
    const counts: Record<string, number> = {};
    for (const r of ideb) counts[r.etapa] = (counts[r.etapa] || 0) + 1;
    const [bestEtapa] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
    etapa = bestEtapa;
  }
  if (!etapa) return null;

  const series = ideb
    .filter((r) => r.etapa === etapa && r.ideb != null)
    .sort((a, b) => a.ano - b.ano);

  if (series.length < 2) return null;

  // Bounds
  const W = 720, H = 340, P = { l: 60, r: 60, t: 30, b: 60 };
  const xMin = series[0].ano;
  const xMax = series[series.length - 1].ano;
  const yMin = 0, yMax = 8;
  const x = (year: number) => P.l + ((year - xMin) / Math.max(1, xMax - xMin)) * (W - P.l - P.r);
  const y = (val: number) => H - P.b - ((val - yMin) / (yMax - yMin)) * (H - P.t - P.b);

  // Path da escola
  const path = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.ano).toFixed(1)} ${y(p.ideb!).toFixed(1)}`).join(' ');

  // Maior queda/alta (anotação)
  let maiorDelta: { from: typeof series[0]; to: typeof series[0]; delta: number } | null = null;
  for (let i = 1; i < series.length; i++) {
    const d = series[i].ideb! - series[i - 1].ideb!;
    if (!maiorDelta || Math.abs(d) > Math.abs(maiorDelta.delta)) {
      maiorDelta = { from: series[i - 1], to: series[i], delta: d };
    }
  }
  const finalIsBaixa = maiorDelta && maiorDelta.delta < -0.3;

  // Y ticks
  const yTicks = [0, 2, 4, 6, 8];

  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        Ideb · {ETAPA_LABEL[etapa] || etapa}
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        Trajetória do Ideb · {series[0].ano}–{series[series.length - 1].ano}
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
        N = nota Saeb padronizada · P = taxa de aprovação. O Ideb combina os dois.
        {microIdeb != null && (
          <> A linha tracejada mostra a média da microrregião {microIdeb.toFixed(2)}.</>
        )}
      </p>

      <div className="rounded-2xl p-5 md:p-8 border border-white/[0.08]"
        style={{ background: 'rgba(255,255,255,0.04)' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 760, margin: '0 auto', display: 'block' }}>
          {/* Grid */}
          <line x1={P.l} y1={P.t} x2={P.l} y2={H - P.b} stroke="rgba(255,255,255,0.1)" />
          <line x1={P.l} y1={H - P.b} x2={W - P.r} y2={H - P.b} stroke="rgba(255,255,255,0.1)" />
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={P.l} y1={y(t)} x2={W - P.r} y2={y(t)}
                stroke="rgba(255,255,255,0.06)" strokeDasharray="3,4" />
              <text x={P.l - 8} y={y(t) + 4} textAnchor="end"
                fontSize="11" fill="rgba(255,255,255,0.4)" fontFamily="Plus Jakarta Sans, sans-serif">
                {t.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Microrregião reference */}
          {microIdeb != null && microIdeb > 0 && (
            <>
              <line x1={x(xMin)} y1={y(microIdeb)} x2={x(xMax)} y2={y(microIdeb)}
                stroke="#34c5cc" strokeWidth="1.5" strokeDasharray="6,5" />
              <text x={x(xMax) + 8} y={y(microIdeb) + 4} fontSize="11" fill="#34c5cc"
                fontFamily="Plus Jakarta Sans, sans-serif" fontWeight="700">
                {microIdeb.toFixed(2)} micro
              </text>
            </>
          )}

          {/* Area sob a curva */}
          <defs>
            <linearGradient id="schoolGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34c5cc" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#34c5cc" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`${path} L ${x(xMax).toFixed(1)} ${(H - P.b).toFixed(1)} L ${x(xMin).toFixed(1)} ${(H - P.b).toFixed(1)} Z`}
            fill="url(#schoolGrad)"
          />

          {/* Linha da escola */}
          <path d={path} fill="none" stroke="#34c5cc" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {/* Pontos */}
          {series.map((p, i) => {
            const isLast = i === series.length - 1;
            const dropOnLast = finalIsBaixa && isLast;
            return (
              <g key={p.ano}>
                <circle cx={x(p.ano)} cy={y(p.ideb!)} r={isLast ? 7 : 5}
                  fill={dropOnLast ? '#dc2626' : 'white'}
                  stroke={dropOnLast ? 'white' : '#34c5cc'} strokeWidth="2.5" />
                <text x={x(p.ano)} y={y(p.ideb!) - 14} textAnchor="middle"
                  fontSize="13" fontWeight="700"
                  fill={dropOnLast ? '#fca5a5' : '#34c5cc'}
                  fontFamily="var(--font-serif), Georgia, serif">
                  {p.ideb!.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* X labels */}
          {series.map((p) => (
            <g key={p.ano}>
              <text x={x(p.ano)} y={H - P.b + 24} textAnchor="middle"
                fontSize="13" fontWeight="700"
                fill={p.ano === xMax && finalIsBaixa ? '#dc2626' : 'white'}
                fontFamily="Plus Jakarta Sans, sans-serif">
                {p.ano}
              </text>
              <text x={x(p.ano)} y={H - P.b + 42} textAnchor="middle"
                fontSize="11" fill="rgba(255,255,255,0.5)"
                fontFamily="Plus Jakarta Sans, sans-serif">
                N {p.nota_saeb != null ? p.nota_saeb.toFixed(2) : '—'}
                {' · '}
                P {p.indicador_rendimento != null ? p.indicador_rendimento.toFixed(2) : '—'}
              </text>
            </g>
          ))}

          {/* Anotação queda */}
          {maiorDelta && Math.abs(maiorDelta.delta) >= 0.3 && (
            <text x={(x(maiorDelta.from.ano) + x(maiorDelta.to.ano)) / 2}
              y={Math.max(y(maiorDelta.from.ideb!), y(maiorDelta.to.ideb!)) + 28}
              textAnchor="middle" fontSize="11" fontWeight="600"
              fill={maiorDelta.delta < 0 ? '#fca5a5' : '#86efac'}
              fontFamily="Plus Jakarta Sans, sans-serif">
              {maiorDelta.delta < 0 ? 'queda de ' : 'alta de '}
              {Math.abs(maiorDelta.delta).toFixed(1)} pts
            </text>
          )}
        </svg>

        <div className="flex justify-center gap-6 text-[13px] text-white/65 mt-3">
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#34c5cc' }} />
            Esta escola
          </span>
          {microIdeb != null && microIdeb > 0 && (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: '#34c5cc' }} />
              Média microrregião
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
