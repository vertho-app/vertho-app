import Link from 'next/link';

const REGIAO_BY_UF: Record<string, string> = {
  AC: 'Norte', AM: 'Norte', AP: 'Norte', PA: 'Norte', RO: 'Norte', RR: 'Norte', TO: 'Norte',
  AL: 'Nordeste', BA: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste',
  PE: 'Nordeste', PI: 'Nordeste', RN: 'Nordeste', SE: 'Nordeste',
  DF: 'Centro-Oeste', GO: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  ES: 'Sudeste', MG: 'Sudeste', RJ: 'Sudeste', SP: 'Sudeste',
  PR: 'Sul', RS: 'Sul', SC: 'Sul',
};

export function HeroEstado({
  uf,
  ufNome,
  totalEscolas,
  totalMunicipios,
  totalSnapshots,
  totalMicrorregioes,
  // ICA médio aproximado (do ranking)
  icaMedio,
  // Saeb % nível 0-1 médio
  pctN01Medio,
}: {
  uf: string;
  ufNome: string;
  totalEscolas: number;
  totalMunicipios: number;
  totalSnapshots: number;
  totalMicrorregioes: number;
  icaMedio: number | null;
  pctN01Medio: number | null;
}) {
  const regiao = REGIAO_BY_UF[uf] || 'Brasil';

  return (
    <header className="relative overflow-hidden mb-10 rounded-3xl"
      style={{
        background: 'linear-gradient(135deg, rgba(8,26,55,0.6) 0%, rgba(15,43,84,0.4) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        padding: 'clamp(28px, 4vw, 48px)',
      }}>
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
        <div className="flex items-center gap-2 mb-4 text-[11px] uppercase tracking-[0.12em] font-bold"
          style={{ color: '#9ae2e6' }}>
          <Link href="/radar" className="text-white/45 hover:text-cyan-300">Brasil</Link>
          <span className="text-white/25">›</span>
          <span className="text-white/55">Região {regiao}</span>
        </div>

        <h1 className="text-white mb-5"
          style={{
            fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
            fontWeight: 600,
            fontSize: 'clamp(36px, 5.5vw, 64px)',
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
          }}>
          <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>{ufNome}</em>
        </h1>

        <div className="flex flex-wrap gap-2 mb-8">
          <Pill highlight>UF {uf}</Pill>
          <Pill>{regiao}</Pill>
          <Pill>{totalMicrorregioes} microrregiões</Pill>
        </div>

        <div
          className="grid gap-px rounded-2xl overflow-hidden"
          style={{
            gridTemplateColumns: 'repeat(4, 1fr)',
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <Stat label="Escolas no Radar" value={totalEscolas.toLocaleString('pt-BR')} />
          <Stat label="Municípios" value={totalMunicipios.toLocaleString('pt-BR')} />
          <Stat
            label={icaMedio != null ? 'ICA médio' : 'Snapshots Saeb'}
            value={icaMedio != null ? `${icaMedio.toFixed(1)}%` : totalSnapshots.toLocaleString('pt-BR')}
            sub={icaMedio != null ? 'média dos municípios' : 'edições agregadas'}
          />
          <Stat
            label="% N0-1 Saeb"
            value={pctN01Medio != null ? `${pctN01Medio.toFixed(1)}%` : '—'}
            sub={pctN01Medio != null ? 'média da UF · menor é melhor' : undefined}
            tone={
              pctN01Medio != null && pctN01Medio > 50 ? 'bad' :
              pctN01Medio != null && pctN01Medio < 30 ? 'good' : 'neutral'
            }
          />
        </div>
      </div>
    </header>
  );
}

function Stat({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const tonColor = tone === 'good' ? '#86efac' : tone === 'bad' ? '#fca5a5' : 'white';
  return (
    <div className="flex flex-col p-5 md:p-6"
      style={{ background: 'rgba(255,255,255,0.03)' }}>
      <p className="text-[10px] tracking-[0.1em] uppercase font-bold text-white/55 mb-2">
        {label}
      </p>
      <p
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(22px, 2.6vw, 30px)',
          fontWeight: 600,
          lineHeight: 1,
          marginBottom: 4,
          color: tonColor,
        }}>
        {value}
      </p>
      {sub && <p className="text-[12px] text-white/55">{sub}</p>}
    </div>
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
