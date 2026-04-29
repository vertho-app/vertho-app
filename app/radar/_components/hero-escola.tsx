import Link from 'next/link';
import type { Escola, EscolaBenchmarkRow, IdebSnapshot, SaebSnapshot } from '@/lib/radar/queries';

type Stat = {
  label: string;
  value: string;
  delta?: { value: string; tone: 'good' | 'bad' | 'neutral' };
  sub?: string;
};

function deltaIdeb(school: number | null, micro: number | null): Stat['delta'] | undefined {
  if (school == null || micro == null) return undefined;
  const diff = school - micro;
  return {
    value: `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`,
    tone: diff >= 0.3 ? 'good' : diff <= -0.3 ? 'bad' : 'neutral',
  };
}

function deltaSaeb(school: number | null, micro: number | null): Stat['delta'] | undefined {
  if (school == null || micro == null) return undefined;
  const diff = school - micro;
  return {
    value: `${diff >= 0 ? '+' : ''}${diff.toFixed(0)} pts`,
    tone: diff >= 10 ? 'good' : diff <= -10 ? 'bad' : 'neutral',
  };
}

/**
 * Pega o etapa+disciplina mais relevante da escola (ano mais recente, etapa
 * que tem mais dados, prioriza 9_EF para coincidir com a referência editorial
 * do Ideb).
 */
function pickRelevantSaeb(saeb: SaebSnapshot[], etapa: string, disciplina: 'LP' | 'MAT'): SaebSnapshot | null {
  const filtered = saeb.filter((s) => s.etapa === etapa && s.disciplina === disciplina);
  if (filtered.length === 0) return null;
  return filtered.sort((a, b) => b.ano - a.ano)[0];
}

function pickEtapaPrincipal(saeb: SaebSnapshot[]): string {
  const counts: Record<string, number> = {};
  for (const s of saeb) counts[s.etapa] = (counts[s.etapa] || 0) + 1;
  // Prioriza 9_EF, depois 5_EF, depois 3_EM
  if (counts['9_EF']) return '9_EF';
  if (counts['5_EF']) return '5_EF';
  if (counts['3_EM']) return '3_EM';
  return Object.keys(counts)[0] || '5_EF';
}

const ETAPA_LABEL: Record<string, string> = {
  '5_EF': '5º ano EF',
  '9_EF': '9º ano EF',
  '3_EM': '3º ano EM',
};

export function HeroEscola({
  escola,
  saeb,
  ideb,
  benchmarks,
}: {
  escola: Escola;
  saeb: SaebSnapshot[];
  ideb: IdebSnapshot[];
  benchmarks: EscolaBenchmarkRow[];
}) {
  const micro = benchmarks.find((b) => b.scope === 'microrregiao');
  const etapaPrincipal = pickEtapaPrincipal(saeb);
  const etapaLabel = ETAPA_LABEL[etapaPrincipal] || etapaPrincipal;

  const idebRecente = ideb
    .filter((i) => {
      // mapeia etapa do ideb → etapa principal Saeb
      if (etapaPrincipal === '5_EF') return i.etapa === '5_EF';
      if (etapaPrincipal === '9_EF') return i.etapa === '9_EF';
      if (etapaPrincipal === '3_EM') return i.etapa === '3_EM';
      return false;
    })
    .filter((i) => i.ideb != null)
    .sort((a, b) => b.ano - a.ano)[0];

  const saebLp  = pickRelevantSaeb(saeb, etapaPrincipal, 'LP');
  const saebMat = pickRelevantSaeb(saeb, etapaPrincipal, 'MAT');

  const idebKey   = etapaPrincipal === '5_EF' ? 'ideb_5ef' : etapaPrincipal === '9_EF' ? 'ideb_9ef' : 'ideb_3em';
  const saebLpKey = `saeb_${etapaPrincipal.toLowerCase()}_lp`  as keyof EscolaBenchmarkRow;
  const saebMatKey = `saeb_${etapaPrincipal.toLowerCase()}_mat` as keyof EscolaBenchmarkRow;

  const microIdeb  = (micro?.[idebKey as keyof EscolaBenchmarkRow] as number | null) ?? null;
  const microSaebLp  = (micro?.[saebLpKey] as number | null) ?? null;
  const microSaebMat = (micro?.[saebMatKey] as number | null) ?? null;

  const stats: Stat[] = [];

  if (idebRecente && idebRecente.ideb != null) {
    stats.push({
      label: `Ideb ${etapaLabel} · ${idebRecente.ano}`,
      value: idebRecente.ideb.toFixed(1),
      delta: deltaIdeb(idebRecente.ideb, microIdeb),
      sub: 'vs microrregião',
    });
  }
  if (saebLp && saebLp.media_proficiencia != null) {
    stats.push({
      label: `Saeb · Português ${etapaLabel}`,
      value: saebLp.media_proficiencia.toFixed(0),
      delta: deltaSaeb(saebLp.media_proficiencia, microSaebLp),
      sub: 'vs microrregião',
    });
  }
  if (saebMat && saebMat.media_proficiencia != null) {
    stats.push({
      label: `Saeb · Matemática ${etapaLabel}`,
      value: saebMat.media_proficiencia.toFixed(0),
      delta: deltaSaeb(saebMat.media_proficiencia, microSaebMat),
      sub: 'vs microrregião',
    });
  }
  if (saebLp?.presentes != null && saebLp.presentes > 0) {
    const pct = saebLp.taxa_participacao != null ? saebLp.taxa_participacao : null;
    stats.push({
      label: `Estudantes ${etapaLabel}`,
      value: saebLp.presentes.toLocaleString('pt-BR'),
      sub: pct != null ? `Participação ${pct.toFixed(1)}%` : 'avaliados',
    });
  }

  const tonColor: Record<NonNullable<Stat['delta']>['tone'], string> = {
    good: '#86efac',
    bad: '#fca5a5',
    neutral: 'rgba(255,255,255,0.55)',
  };

  return (
    <header className="relative overflow-hidden mb-10 rounded-3xl"
      style={{
        background: 'linear-gradient(135deg, rgba(8,26,55,0.6) 0%, rgba(15,43,84,0.4) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        padding: 'clamp(28px, 4vw, 48px)',
      }}>
      {/* círculos decorativos cyan */}
      <div aria-hidden className="pointer-events-none absolute"
        style={{
          right: -140, top: -120, width: 480, height: 480,
          border: '60px solid rgba(52,197,204,0.06)', borderRadius: '50%',
        }} />
      <div aria-hidden className="pointer-events-none absolute"
        style={{
          right: 60, bottom: -200, width: 320, height: 320,
          border: '30px solid rgba(52,197,204,0.04)', borderRadius: '50%',
        }} />

      <div className="relative">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-4 text-[11px] uppercase tracking-[0.12em] font-bold"
          style={{ color: '#9ae2e6' }}>
          <Link href="/" className="text-white/45 hover:text-cyan-300">Escolas</Link>
          <span className="text-white/25">›</span>
          <Link href={`/radar/estado/${escola.uf}`} className="text-white/45 hover:text-cyan-300">{escola.uf}</Link>
          {escola.municipio_ibge && (
            <>
              <span className="text-white/25">›</span>
              <Link href={`/radar/municipio/${escola.municipio_ibge}`} className="text-white/45 hover:text-cyan-300">
                {escola.municipio}
              </Link>
            </>
          )}
        </div>

        {/* Nome */}
        <h1 className="text-white mb-5"
          style={{
            fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
            fontWeight: 600,
            fontSize: 'clamp(28px, 4.5vw, 52px)',
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            maxWidth: 900,
          }}>
          {escola.nome}
        </h1>

        {/* Pills */}
        <div className="flex flex-wrap gap-2 mb-8">
          <Pill>{escola.municipio}/{escola.uf}</Pill>
          {escola.rede && <Pill>Rede {escola.rede.toLowerCase()}</Pill>}
          {escola.zona && <Pill>Zona {escola.zona.toLowerCase()}</Pill>}
          {escola.inse_grupo != null && <Pill highlight>INSE Grupo {escola.inse_grupo}</Pill>}
          <Pill>INEP {escola.codigo_inep}</Pill>
          {escola.ano_referencia && <Pill>Ref. {escola.ano_referencia}</Pill>}
        </div>

        {/* Hero stats */}
        {stats.length > 0 && (
          <div
            className="grid gap-px rounded-2xl overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)`,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {stats.map((s, i) => (
              <div key={i} className="flex flex-col p-5 md:p-6"
                style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-[10px] tracking-[0.1em] uppercase font-bold text-white/55 mb-2">
                  {s.label}
                </p>
                <p className="text-white"
                  style={{
                    fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                    fontSize: 'clamp(24px, 3vw, 32px)',
                    fontWeight: 600,
                    lineHeight: 1,
                    marginBottom: 4,
                  }}>
                  {s.value}
                </p>
                <p className="text-[12px] text-white/55">
                  {s.delta && (
                    <span className="font-bold mr-1" style={{ color: tonColor[s.delta.tone] }}>
                      {s.delta.value}
                    </span>
                  )}
                  {s.sub}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

function Pill({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
      style={{
        background: highlight ? 'rgba(52,197,204,0.15)' : 'rgba(255,255,255,0.08)',
        border: `1px solid ${highlight ? 'rgba(52,197,204,0.4)' : 'rgba(255,255,255,0.12)'}`,
        color: highlight ? '#9ae2e6' : 'rgba(255,255,255,0.85)',
      }}
    >
      {children}
    </span>
  );
}
