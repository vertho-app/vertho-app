import { TrendingUp } from 'lucide-react';
import type { MunicipioVariabilidade } from '@/lib/radar/queries';

const ETAPA_LABEL = { '5_EF': '5º ano EF', '9_EF': '9º ano EF', '3_EM': '3º ano EM' } as const;

/**
 * Coeficiente de variação (cv = stddev/avg). Classifica:
 * <8% rede consistente · 8-15% moderada · >15% heterogênea
 */
function classificarVariabilidade(avg: number | null, stddev: number | null): {
  cv: number | null;
  rotulo: string;
  cor: string;
  narrativa: string;
} {
  if (!avg || !stddev || avg === 0) return { cv: null, rotulo: '—', cor: 'rgba(255,255,255,0.5)', narrativa: '' };
  const cv = (stddev / avg) * 100;
  if (cv < 8) return {
    cv,
    rotulo: 'rede consistente',
    cor: '#86efac',
    narrativa: 'As escolas têm desempenho próximo entre si — sinal de gestão e formação relativamente uniformes.',
  };
  if (cv < 15) return {
    cv,
    rotulo: 'rede moderada',
    cor: '#FCD34D',
    narrativa: 'Há diferenças relevantes entre as escolas. Vale identificar o que separa as melhores das piores.',
  };
  return {
    cv,
    rotulo: 'rede heterogênea',
    cor: '#fca5a5',
    narrativa: 'Disparidade alta entre escolas — algumas indo bem isoladamente, outras muito mal. A rede não está se nivelando.',
  };
}

function StatItem({ label, value, formatter }: { label: string; value: number | null; formatter: (v: number) => string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/40 mb-1">{label}</p>
      <p className="text-white"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 22, fontWeight: 600, lineHeight: 1,
        }}>
        {value != null ? formatter(value) : '—'}
      </p>
    </div>
  );
}

export function VariabilidadeCard({ data }: { data: MunicipioVariabilidade }) {
  if (!data || data.qtd_escolas < 5) return null;

  const lpClass = classificarVariabilidade(data.saeb_lp_avg, data.saeb_lp_stddev);
  const matClass = classificarVariabilidade(data.saeb_mat_avg, data.saeb_mat_stddev);
  // Pega o de maior variabilidade pra título
  const piorClass = (lpClass.cv ?? 0) >= (matClass.cv ?? 0) ? lpClass : matClass;

  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        Variabilidade da Rede
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        As escolas da rede vão juntas ou cada uma por si?
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
        Comparação interna do município no Saeb {ETAPA_LABEL[data.etapa]} entre {data.qtd_escolas}{' '}
        escolas. Mede consistência da rede usando coeficiente de variação (desvio-padrão ÷ média).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <DimensaoCard
          titulo="Língua Portuguesa"
          avg={data.saeb_lp_avg}
          stddev={data.saeb_lp_stddev}
          min={data.saeb_lp_min}
          max={data.saeb_lp_max}
          cls={lpClass}
        />
        <DimensaoCard
          titulo="Matemática"
          avg={data.saeb_mat_avg}
          stddev={data.saeb_mat_stddev}
          min={data.saeb_mat_min}
          max={data.saeb_mat_max}
          cls={matClass}
        />
      </div>

      {data.ideb_avg != null && data.ideb_stddev != null && (
        <div className="rounded-2xl p-4 border border-white/[0.08] grid grid-cols-3 gap-4 mb-4"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <StatItem label="Ideb médio" value={data.ideb_avg} formatter={(v) => v.toFixed(2)} />
          <StatItem label="Desvio-padrão" value={data.ideb_stddev} formatter={(v) => `±${v.toFixed(2)}`} />
          <StatItem label="Coef. variação" value={(data.ideb_stddev / data.ideb_avg) * 100} formatter={(v) => `${v.toFixed(1)}%`} />
        </div>
      )}

      <div className="rounded-xl px-4 py-3 text-[13px] leading-relaxed"
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderLeft: `3px solid ${piorClass.cor}`,
          color: 'rgba(255,255,255,0.7)',
        }}>
        <strong className="text-white/85">Leitura: </strong>
        <span style={{ color: piorClass.cor, fontWeight: 700 }}>{piorClass.rotulo}.</span>{' '}
        {piorClass.narrativa}
      </div>
    </section>
  );
}

function DimensaoCard({
  titulo, avg, stddev, min, max, cls,
}: {
  titulo: string;
  avg: number | null;
  stddev: number | null;
  min: number | null;
  max: number | null;
  cls: ReturnType<typeof classificarVariabilidade>;
}) {
  return (
    <div className="rounded-2xl p-5 border border-white/[0.08]"
      style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-white font-bold text-base">{titulo}</h3>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{
            background: cls.cor === '#fca5a5' ? 'rgba(220,38,38,0.18)' :
                        cls.cor === '#FCD34D' ? 'rgba(245,158,11,0.18)' :
                        cls.cor === '#86efac' ? 'rgba(34,197,94,0.18)' :
                        'rgba(255,255,255,0.08)',
            color: cls.cor,
          }}>
          {cls.cv != null ? `${cls.cv.toFixed(1)}% cv` : '—'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <StatItem label="Média" value={avg} formatter={(v) => v.toFixed(0)} />
        <StatItem label="Desvio" value={stddev} formatter={(v) => `±${v.toFixed(1)}`} />
      </div>

      {/* Mini range bar */}
      {min != null && max != null && avg != null && (
        <>
          <div className="relative h-2 rounded-full mt-4 mb-1"
            style={{ background: 'linear-gradient(90deg, rgba(220,38,38,0.5) 0%, rgba(255,255,255,0.15) 50%, rgba(34,197,94,0.5) 100%)' }}>
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white"
              style={{
                left: `${Math.max(0, Math.min(100, ((avg - min) / (max - min)) * 100))}%`,
                background: '#34c5cc',
              }} />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-white/50">
            <span>min {min.toFixed(0)}</span>
            <span>amplitude {(max - min).toFixed(0)} pts</span>
            <span>max {max.toFixed(0)}</span>
          </div>
        </>
      )}
    </div>
  );
}
