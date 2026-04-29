import { BarChart3 } from 'lucide-react';
import type { EscolaBenchmarkRow } from '@/lib/radar/queries';

type IndicadorRow = {
  key: keyof Omit<EscolaBenchmarkRow, 'scope' | 'qtd_escolas' | 'inse_grupo'>;
  label: string;
  unit: 'ideb' | 'saeb';
  // Range pra desenhar a barra como % do max esperado
  max: number;
  // limiar pro delta-tag
  threshold: number;
};

const INDICADORES: IndicadorRow[] = [
  { key: 'ideb_5ef',     label: 'Ideb · 5º ano EF',                 unit: 'ideb', max: 8,   threshold: 0.3 },
  { key: 'ideb_9ef',     label: 'Ideb · 9º ano EF',                 unit: 'ideb', max: 8,   threshold: 0.3 },
  { key: 'ideb_3em',     label: 'Ideb · 3º ano EM',                 unit: 'ideb', max: 8,   threshold: 0.3 },
  { key: 'saeb_5ef_lp',  label: 'Saeb · LP · 5º ano EF',            unit: 'saeb', max: 350, threshold: 10 },
  { key: 'saeb_5ef_mat', label: 'Saeb · MAT · 5º ano EF',           unit: 'saeb', max: 350, threshold: 10 },
  { key: 'saeb_9ef_lp',  label: 'Saeb · LP · 9º ano EF',            unit: 'saeb', max: 350, threshold: 10 },
  { key: 'saeb_9ef_mat', label: 'Saeb · MAT · 9º ano EF',           unit: 'saeb', max: 350, threshold: 10 },
  { key: 'saeb_3em_lp',  label: 'Saeb · LP · 3º ano EM',            unit: 'saeb', max: 400, threshold: 10 },
  { key: 'saeb_3em_mat', label: 'Saeb · MAT · 3º ano EM',           unit: 'saeb', max: 400, threshold: 10 },
];

function fmtValue(v: number | null, unit: IndicadorRow['unit']): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return unit === 'ideb' ? v.toFixed(2) : v.toFixed(0);
}

function pctOfMax(v: number | null, max: number): number {
  if (v == null) return 0;
  return Math.max(0, Math.min(100, (v / max) * 100));
}

type Tone = 'good' | 'bad' | 'neutral';

function deltaTone(escola: number | null, micro: number | null, threshold: number): Tone {
  if (escola == null || micro == null) return 'neutral';
  const d = escola - micro;
  if (d >= threshold) return 'good';
  if (d <= -threshold) return 'bad';
  return 'neutral';
}

function deltaText(escola: number | null, micro: number | null, unit: IndicadorRow['unit']): string {
  if (escola == null || micro == null) return '—';
  const d = escola - micro;
  if (unit === 'ideb') return `${d >= 0 ? '+' : ''}${d.toFixed(2)} vs micro`;
  return `${d >= 0 ? '+' : ''}${d.toFixed(0)} pts vs micro`;
}

const TONE_COLOR: Record<Tone, string> = {
  good: '#86efac',
  bad: '#fca5a5',
  neutral: 'rgba(255,255,255,0.55)',
};
const TONE_BG: Record<Tone, string> = {
  good: 'rgba(34,197,94,0.18)',
  bad: 'rgba(220,38,38,0.18)',
  neutral: 'rgba(255,255,255,0.08)',
};

function Bar({
  label,
  qtd,
  value,
  unit,
  max,
  fillColor,
  emphasized,
}: {
  label: string;
  qtd?: number | null;
  value: number | null;
  unit: IndicadorRow['unit'];
  max: number;
  fillColor: string;
  emphasized?: boolean;
}) {
  return (
    <div className="grid grid-cols-12 items-center gap-3">
      <div className="col-span-5 md:col-span-4 text-sm"
        style={{ color: emphasized ? 'white' : 'rgba(255,255,255,0.7)', fontWeight: emphasized ? 700 : 500 }}>
        {label}
        {qtd != null && qtd > 1 && (
          <span className="text-white/40 text-[11px] ml-1.5">({qtd.toLocaleString('pt-BR')} esc.)</span>
        )}
      </div>
      <div className="col-span-5 md:col-span-7">
        <div className="h-[14px] rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${pctOfMax(value, max)}%`,
              background: fillColor,
            }} />
        </div>
      </div>
      <div className="col-span-2 md:col-span-1 text-right font-mono font-bold"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 18,
          color: emphasized ? '#fca5a5' : 'white',
        }}>
        {fmtValue(value, unit)}
      </div>
    </div>
  );
}

export function EscolaBenchmarkTable({
  rows,
  microrregiao,
  uf,
}: {
  rows: EscolaBenchmarkRow[];
  microrregiao?: string | null;
  uf?: string | null;
}) {
  const escola = rows.find((r) => r.scope === 'escola');
  const micro  = rows.find((r) => r.scope === 'microrregiao');
  const estado = rows.find((r) => r.scope === 'estado');

  if (!escola) return null;

  const visiveis = INDICADORES.filter((ind) => escola[ind.key] != null);
  if (visiveis.length === 0) return null;

  const inseGrupo = escola.inse_grupo;

  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        Comparativo Justo
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        Onde a escola está em relação a pares socioeconômicos
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
        {inseGrupo != null ? (
          <>
            Comparamos apenas com escolas do mesmo grupo INSE
            ({`Grupo ${inseGrupo}`}) — controlando por contexto socioeconômico, não comparando
            escolas em realidades distintas.
          </>
        ) : (
          <>Esta escola não tem INSE classificado, então a média inclui todas as escolas da microrregião.</>
        )}
      </p>

      <div className="flex flex-col gap-4">
        {visiveis.map((ind) => {
          const ev = escola[ind.key];
          const mv = micro?.[ind.key] ?? null;
          const sv = estado?.[ind.key] ?? null;
          const tone = deltaTone(ev, mv, ind.threshold);
          return (
            <div key={ind.key} className="rounded-2xl border p-5 md:p-6 transition-colors"
              style={{
                background: 'rgba(255,255,255,0.04)',
                borderColor: 'rgba(255,255,255,0.08)',
              }}>
              <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
                <h3 className="text-white text-base md:text-lg font-bold">{ind.label}</h3>
                <span className="text-[12px] font-bold px-3 py-1 rounded-full"
                  style={{ background: TONE_BG[tone], color: TONE_COLOR[tone] }}>
                  {deltaText(ev, mv, ind.unit)}
                </span>
              </div>

              <div className="space-y-3">
                <Bar label="Esta escola" value={ev} unit={ind.unit} max={ind.max}
                  fillColor="#dc2626" emphasized />
                <Bar label="Microrregião"
                  qtd={micro?.qtd_escolas}
                  value={mv} unit={ind.unit} max={ind.max}
                  fillColor="#34c5cc" />
                <Bar label="Estado"
                  qtd={estado?.qtd_escolas}
                  value={sv} unit={ind.unit} max={ind.max}
                  fillColor="rgba(255,255,255,0.3)" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl px-4 py-3 text-[13px] leading-relaxed"
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderLeft: '3px solid #34c5cc',
          color: 'rgba(255,255,255,0.7)',
        }}>
        <strong className="text-white/85">Como ler:</strong> verde = acima da microrregião com folga;
        vermelho = abaixo. Médias da microrregião e do estado excluem a própria escola e
        consideram apenas escolas do mesmo grupo INSE quando a escola-alvo tem o indicador.
      </div>
    </section>
  );
}
