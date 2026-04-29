import type { SaebSnapshot } from '@/lib/radar/queries';

const ETAPA_LABEL: Record<string, string> = {
  '5_EF': '5º ano EF',
  '9_EF': '9º ano EF',
  '3_EM': '3º ano EM',
};

export function SaebHistoryChart({
  saeb,
  microLp,
  microMat,
  preferredEtapa,
}: {
  saeb: SaebSnapshot[];
  microLp?: number | null;
  microMat?: number | null;
  preferredEtapa?: string;
}) {
  if (!saeb.length) return null;

  let etapa = preferredEtapa;
  if (!etapa) {
    const counts: Record<string, number> = {};
    for (const r of saeb) counts[r.etapa] = (counts[r.etapa] || 0) + 1;
    const [bestEtapa] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
    etapa = bestEtapa;
  }
  if (!etapa) return null;

  const lp = saeb.filter((s) => s.etapa === etapa && s.disciplina === 'LP' && s.media_proficiencia != null)
    .sort((a, b) => a.ano - b.ano);
  const mat = saeb.filter((s) => s.etapa === etapa && s.disciplina === 'MAT' && s.media_proficiencia != null)
    .sort((a, b) => a.ano - b.ano);

  const allYears = Array.from(new Set([...lp.map((s) => s.ano), ...mat.map((s) => s.ano)])).sort((a, b) => a - b);
  if (allYears.length < 2) return null;

  const W = 720, H = 360, P = { l: 60, r: 60, t: 30, b: 70 };
  const xMin = allYears[0];
  const xMax = allYears[allYears.length - 1];
  const allVals = [
    ...lp.map((s) => s.media_proficiencia!),
    ...mat.map((s) => s.media_proficiencia!),
    ...(microLp != null ? [microLp] : []),
    ...(microMat != null ? [microMat] : []),
  ];
  const yMin = Math.floor(Math.min(...allVals) / 10) * 10 - 10;
  const yMax = Math.ceil(Math.max(...allVals) / 10) * 10 + 10;
  const x = (year: number) => P.l + ((year - xMin) / Math.max(1, xMax - xMin)) * (W - P.l - P.r);
  const y = (val: number) => H - P.b - ((val - yMin) / (yMax - yMin)) * (H - P.t - P.b);

  const lpPath = lp.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.ano).toFixed(1)} ${y(p.media_proficiencia!).toFixed(1)}`).join(' ');
  const matPath = mat.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.ano).toFixed(1)} ${y(p.media_proficiencia!).toFixed(1)}`).join(' ');

  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += Math.max(20, Math.round((yMax - yMin) / 4 / 10) * 10)) yTicks.push(v);

  // Variação total LP/Mat
  const lpDelta = lp.length >= 2 ? lp[lp.length - 1].media_proficiencia! - lp[0].media_proficiencia! : null;
  const matDelta = mat.length >= 2 ? mat[mat.length - 1].media_proficiencia! - mat[0].media_proficiencia! : null;

  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        Histórico Saeb · {ETAPA_LABEL[etapa] || etapa}
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        Trajetória das notas Saeb por edição
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
        Notas oficiais do Saeb por disciplina, em escala de proficiência. Edições bienais.
      </p>

      <div className="rounded-2xl p-5 md:p-8 border border-white/[0.08]"
        style={{ background: 'rgba(255,255,255,0.04)' }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 760, margin: '0 auto', display: 'block' }}>
          <line x1={P.l} y1={P.t} x2={P.l} y2={H - P.b} stroke="rgba(255,255,255,0.1)" />
          <line x1={P.l} y1={H - P.b} x2={W - P.r} y2={H - P.b} stroke="rgba(255,255,255,0.1)" />
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={P.l} y1={y(t)} x2={W - P.r} y2={y(t)}
                stroke="rgba(255,255,255,0.06)" strokeDasharray="3,4" />
              <text x={P.l - 8} y={y(t) + 4} textAnchor="end"
                fontSize="11" fill="rgba(255,255,255,0.4)" fontFamily="Plus Jakarta Sans, sans-serif">
                {t}
              </text>
            </g>
          ))}

          {/* Microrregião LP */}
          {microLp != null && (
            <>
              <line x1={x(xMin)} y1={y(microLp)} x2={x(xMax)} y2={y(microLp)}
                stroke="rgba(52,197,204,0.5)" strokeWidth="1.5" strokeDasharray="6,5" />
            </>
          )}
          {microMat != null && (
            <>
              <line x1={x(xMin)} y1={y(microMat)} x2={x(xMax)} y2={y(microMat)}
                stroke="rgba(252,165,165,0.5)" strokeWidth="1.5" strokeDasharray="6,5" />
            </>
          )}

          {/* Linhas */}
          {lpPath && <path d={lpPath} fill="none" stroke="#34c5cc" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
          {matPath && <path d={matPath} fill="none" stroke="#fca5a5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}

          {/* Pontos LP */}
          {lp.map((p, i) => (
            <g key={`lp-${p.ano}`}>
              <circle cx={x(p.ano)} cy={y(p.media_proficiencia!)} r={i === lp.length - 1 ? 7 : 6}
                fill="#081a37" stroke="#34c5cc" strokeWidth="2.5" />
              <text x={x(p.ano)} y={y(p.media_proficiencia!) - 14} textAnchor="middle"
                fontSize="12" fontWeight="700" fill="#34c5cc"
                fontFamily="var(--font-serif), Georgia, serif">
                {p.media_proficiencia!.toFixed(0)}
              </text>
            </g>
          ))}
          {/* Pontos Mat */}
          {mat.map((p, i) => (
            <g key={`mat-${p.ano}`}>
              <circle cx={x(p.ano)} cy={y(p.media_proficiencia!)} r={i === mat.length - 1 ? 7 : 6}
                fill="#081a37" stroke="#fca5a5" strokeWidth="2.5" />
              <text x={x(p.ano)} y={y(p.media_proficiencia!) + 18} textAnchor="middle"
                fontSize="12" fontWeight="700" fill="#fca5a5"
                fontFamily="var(--font-serif), Georgia, serif">
                {p.media_proficiencia!.toFixed(0)}
              </text>
            </g>
          ))}

          {/* X labels */}
          {allYears.map((ano) => (
            <text key={ano} x={x(ano)} y={H - P.b + 24} textAnchor="middle"
              fontSize="13" fontWeight="700" fill="white"
              fontFamily="Plus Jakarta Sans, sans-serif">
              {ano}
            </text>
          ))}
        </svg>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] text-white/65 mt-3">
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#34c5cc' }} />
            Língua Portuguesa
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: '#fca5a5' }} />
            Matemática
          </span>
          {(microLp != null || microMat != null) && (
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: 'rgba(255,255,255,0.5)' }} />
              Média microrregião
            </span>
          )}
        </div>
      </div>

      {/* Variação total cards */}
      {(lpDelta != null || matDelta != null) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {lpDelta != null && <DeltaCard label="Variação · Português" delta={lpDelta} />}
          {matDelta != null && <DeltaCard label="Variação · Matemática" delta={matDelta} />}
        </div>
      )}
    </section>
  );
}

function DeltaCard({ label, delta }: { label: string; delta: number }) {
  const isNeg = delta < 0;
  const cor = Math.abs(delta) < 5 ? 'rgba(255,255,255,0.7)' : isNeg ? '#fca5a5' : '#86efac';
  return (
    <div className="rounded-2xl p-5 border border-white/[0.08]" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <p className="text-[10px] tracking-[0.1em] uppercase font-bold text-white/45 mb-2">{label}</p>
      <p style={{
        fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
        fontSize: 28, fontWeight: 600, color: cor, lineHeight: 1,
      }}>
        {delta >= 0 ? '+' : ''}{delta.toFixed(0)} pts
      </p>
      <p className="text-[13px] text-white/65 mt-2">
        {isNeg && Math.abs(delta) >= 10
          ? 'Queda relevante. Vale investigar pedagogia e fluxo.'
          : !isNeg && Math.abs(delta) >= 10
          ? 'Crescimento relevante. Captura de boas práticas.'
          : 'Variação dentro do ruído estatístico esperado.'}
      </p>
    </div>
  );
}
