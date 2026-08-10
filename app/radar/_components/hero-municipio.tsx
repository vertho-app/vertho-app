import Link from 'next/link';
import type { BenchmarkRow, FundebRepasse, IcaSnapshot, MunicipioEnemAggregate, MunicipioIdebAggregate } from '@/lib/radar/queries';

type Stat = {
  label: string;
  value: string;
  delta?: { value: string; tone: 'good' | 'bad' | 'neutral' };
  sub?: string;
};

const FMT_BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
});

function deltaPct(school: number | null, micro: number | null): Stat['delta'] | undefined {
  if (school == null || micro == null) return undefined;
  const diff = school - micro;
  return {
    value: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} p.p.`,
    tone: diff >= 5 ? 'good' : diff <= -5 ? 'bad' : 'neutral',
  };
}

function deltaIdeb(school: number | null, micro: number | null): Stat['delta'] | undefined {
  if (school == null || micro == null) return undefined;
  const diff = school - micro;
  return {
    value: `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`,
    tone: diff >= 0.3 ? 'good' : diff <= -0.3 ? 'bad' : 'neutral',
  };
}

export function HeroMunicipio({
  ibge,
  nome,
  uf,
  totalEscolas,
  redes,
  ica,
  ideb,
  enem,
  fundeb,
  benchmarks,
  microrregiao,
}: {
  ibge: string;
  nome: string;
  uf: string;
  totalEscolas: number;
  redes: Record<string, number>;
  ica: IcaSnapshot[];
  ideb: MunicipioIdebAggregate[];
  enem: MunicipioEnemAggregate[];
  fundeb: FundebRepasse[];
  benchmarks: BenchmarkRow[];
  microrregiao: string | null;
}) {
  const cidade = benchmarks.find((b) => b.scope === 'cidade');
  const micro  = benchmarks.find((b) => b.scope === 'microrregiao');

  // ICA mais recente (qualquer rede)
  const icaRecente = ica.filter((i) => (i.taxa ?? 0) > 0).sort((a, b) => b.ano - a.ano)[0];

  // Ideb médio mais recente (preferência: 5_EF, depois 9_EF, depois 3_EM)
  const idebPick = (() => {
    const pref = ['5_EF', '9_EF', '3_EM'];
    for (const p of pref) {
      const found = ideb.filter((i) => i.etapa === p && i.idebAvg != null).sort((a, b) => b.ano - a.ano)[0];
      if (found) return found;
    }
    return null;
  })();
  const microIdebKey = idebPick?.etapa === '5_EF' ? 'ideb_5ef'
    : idebPick?.etapa === '9_EF' ? 'ideb_9ef'
    : idebPick?.etapa === '3_EM' ? 'ideb_3em' : null;
  const microIdeb = microIdebKey ? (micro?.[microIdebKey as keyof BenchmarkRow] as number | null) : null;

  const fundebRecente = fundeb.filter((f) => f.valor_aluno_ano != null).sort((a, b) => b.ano - a.ano)[0];
  const enemRecente = enem
    .filter((row) => row.escolasCom10 > 0 && row.mediaGeralPonderada != null)
    .sort((a, b) => b.ano - a.ano)[0];

  const stats: Stat[] = [];
  if (icaRecente && (icaRecente.taxa ?? 0) > 0) {
    stats.push({
      label: `ICA · ${icaRecente.ano}`,
      value: `${icaRecente.taxa!.toFixed(1)}%`,
      delta: deltaPct(icaRecente.taxa, micro?.ica_taxa ?? null),
      sub: 'vs microrregião',
    });
  }
  if (idebPick && idebPick.idebAvg != null) {
    const labels: Record<string, string> = { '5_EF': '5º EF', '9_EF': '9º EF', '3_EM': '3º EM' };
    stats.push({
      label: `Ideb ${labels[idebPick.etapa] || idebPick.etapa} · ${idebPick.ano}`,
      value: idebPick.idebAvg.toFixed(2),
      delta: deltaIdeb(idebPick.idebAvg, microIdeb),
      sub: 'média da rede',
    });
  }
  if (fundebRecente && fundebRecente.valor_aluno_ano != null) {
    stats.push({
      label: `FUNDEB · aluno/ano · ${fundebRecente.ano}`,
      value: FMT_BRL.format(fundebRecente.valor_aluno_ano),
      sub: fundebRecente.matriculas_consideradas
        ? `${fundebRecente.matriculas_consideradas.toLocaleString('pt-BR')} matrículas`
        : undefined,
    });
  }
  if (enemRecente && enemRecente.mediaGeralPonderada != null) {
    stats.push({
      label: `ENEM · média geral · ${enemRecente.ano}`,
      value: enemRecente.mediaGeralPonderada.toFixed(1),
      sub: `${enemRecente.escolasCom10} escolas · ${enemRecente.participantesTotalCom10.toLocaleString('pt-BR')} participantes`,
    });
  }
  stats.push({
    label: 'Escolas no Radar',
    value: totalEscolas.toLocaleString('pt-BR'),
    sub: Object.entries(redes).slice(0, 2).map(([r, n]) => `${r.slice(0, 3)} ${n}`).join(' · '),
  });

  const tonColor: Record<NonNullable<Stat['delta']>['tone'], string> = {
    good: '#86efac',
    bad: '#fca5a5',
    neutral: 'rgba(255,255,255,0.55)',
  };
  const heroStats = stats.slice(0, 4);

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
          <Link href="/radar" className="text-white/45 hover:text-cyan-300">Municípios</Link>
          <span className="text-white/25">›</span>
          <Link href={`/radar/estado/${uf}`} className="text-white/45 hover:text-cyan-300">{uf}</Link>
        </div>

        <h1 className="text-white mb-5"
          style={{
            fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
            fontWeight: 600,
            fontSize: 'clamp(28px, 4.5vw, 52px)',
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
          }}>
          {nome}, <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>{uf}</em>
        </h1>

        <div className="flex flex-wrap gap-2 mb-8">
          <Pill>IBGE {ibge}</Pill>
          {microrregiao && <Pill highlight>Microrregião {microrregiao}</Pill>}
          <Pill>{totalEscolas.toLocaleString('pt-BR')} escolas</Pill>
          {Object.entries(redes).slice(0, 3).map(([rede, n]) => (
            <Pill key={rede}>
              {n.toLocaleString('pt-BR')} {rede.toLowerCase()}
            </Pill>
          ))}
        </div>

        {heroStats.length > 0 && (
          <div
            className="grid gap-px rounded-2xl overflow-hidden"
            style={{
              gridTemplateColumns: `repeat(${heroStats.length}, 1fr)`,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {heroStats.map((s, i) => (
              <div key={i} className="flex flex-col p-5 md:p-6"
                style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-[10px] tracking-[0.1em] uppercase font-bold text-white/55 mb-2">
                  {s.label}
                </p>
                <p className="text-white"
                  style={{
                    fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                    fontSize: 'clamp(22px, 2.6vw, 30px)',
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

        {/* CTA pra ver a rede municipal em detalhe */}
        {totalEscolas >= 5 && (
          <div className="mt-6">
            <Link href={`/radar/rede/${ibge}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{
                background: 'rgba(52,197,204,0.15)',
                border: '1px solid rgba(52,197,204,0.3)',
                color: '#34c5cc',
              }}>
              Análise interna da rede →
            </Link>
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
