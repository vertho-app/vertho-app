'use client';

import { GraduationCap, BookOpen, TrendingUp, Coins, Award, ArrowDown, ArrowUp, Minus, CheckCircle2, AlertCircle } from 'lucide-react';

type IcaLite = {
  rede: string | null;
  ano: number;
  taxa: number | null;
  alunos_avaliados?: number | null;
  alfabetizados?: number | null;
  total_estado?: number | null;
  total_brasil?: number | null;
};

type IdebMunLite = {
  ano: number;
  etapa: string;
  idebAvg: number | null;
  totalEscolas: number;
};

type EnemMunLite = {
  ano: number;
  escolasCom10: number;
  participantesMediaGeral: number;
  mediaGeralPonderada: number | null;
  mediaRedacaoPonderada: number | null;
};

type FundebLite = {
  ano: number;
  total_repasse_bruto: number | null;
  valor_aluno_ano: number | null;
  matriculas_consideradas: number | null;
};

type VaarLite = {
  ano: number;
  habilitado: boolean | null;
  beneficiario: boolean | null;
  evoluiu_atendimento: boolean | null;
  evoluiu_aprendizagem: boolean | null;
};

const ETAPA_LABEL: Record<string, string> = {
  '5_EF': '5º EF',
  '9_EF': '9º EF',
  '3_EM': '3º EM',
};

function fmtMilhar(v: number | null | undefined): string {
  if (v == null) return '—';
  return Math.round(v).toLocaleString('pt-BR');
}

function fmtMoeda(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}k`;
  return `R$ ${v.toFixed(0)}`;
}

type BenchmarkRow = {
  scope: 'cidade' | 'microrregiao' | 'estado' | 'brasil';
  ica_taxa: number | null;
  ideb_5ef: number | null;
  ideb_9ef: number | null;
  ideb_3em: number | null;
  saeb_5ef_lp: number | null;
  saeb_5ef_mat: number | null;
  saeb_9ef_lp: number | null;
  saeb_9ef_mat: number | null;
  fundeb_aluno: number | null;
  qtd_munis: number | null;
};

export function PanoramaMunicipio({
  ica, ideb, enem, fundeb, vaar, receitaPrevista, totalEscolas, redes, benchmarks,
}: {
  ica: IcaLite[];
  ideb: IdebMunLite[];
  enem: EnemMunLite[];
  fundeb: FundebLite[];
  vaar: VaarLite | null;
  receitaPrevista: any | null;
  totalEscolas: number;
  redes: Record<string, number>;
  benchmarks?: BenchmarkRow[];
}) {
  // ICA mais recente da rede municipal (preferencial), com benchmark UF/Brasil
  const icaMunicipal = ica
    .filter((i) => (i.rede || '').toUpperCase() === 'MUNICIPAL' && i.taxa != null)
    .sort((a, b) => b.ano - a.ano)[0]
    || ica.filter((i) => i.taxa != null).sort((a, b) => b.ano - a.ano)[0]
    || null;

  // Ideb agregado da etapa principal (a com mais snapshots)
  const idebRecentePorEtapa = (() => {
    if (!ideb.length) return null;
    const counts: Record<string, number> = {};
    for (const r of ideb) counts[r.etapa] = (counts[r.etapa] || 0) + 1;
    const etapa = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!etapa) return null;
    return ideb.filter((r) => r.etapa === etapa && r.idebAvg != null).sort((a, b) => b.ano - a.ano)[0] || null;
  })();

  // ENEM agregado mais recente
  const enemRecente = [...enem].sort((a, b) => b.ano - a.ano)[0] || null;

  // FUNDEB mais recente
  const fundebRecente = [...fundeb].sort((a, b) => b.ano - a.ano)[0] || null;

  // ICA timeline (rede municipal ou todas se não houver)
  const icaTimeline = (() => {
    const fonte = ica.filter((i) => (i.rede || '').toUpperCase() === 'MUNICIPAL' && i.taxa != null);
    const usar = fonte.length >= 2 ? fonte : ica.filter((i) => i.taxa != null);
    return usar.sort((a, b) => a.ano - b.ano).slice(-6);
  })();

  // Ideb timeline da etapa principal
  const idebTimeline = (() => {
    if (!idebRecentePorEtapa) return [];
    return ideb
      .filter((r) => r.etapa === idebRecentePorEtapa.etapa && r.idebAvg != null)
      .sort((a, b) => a.ano - b.ano)
      .slice(-6);
  })();

  const hasAnyKpi = icaMunicipal || idebRecentePorEtapa || enemRecente || fundebRecente;
  if (!hasAnyKpi) return null;

  return (
    <section className="mb-10">
      <p className="eyebrow-manrope text-cyan-300/85 mb-2">Panorama da rede</p>
      <h2 className="text-white mb-5" style={{
        fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
        fontSize: 'clamp(22px, 2.6vw, 28px)',
        fontWeight: 600,
        letterSpacing: '-0.02em',
      }}>
        Indicadores principais
      </h2>

      {/* KPI strip — até 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {icaMunicipal && (
          <KpiCard
            icon={BookOpen}
            label={`ICA · ${(icaMunicipal.rede || 'rede').toLowerCase()}`}
            ano={icaMunicipal.ano}
            valor={`${Number(icaMunicipal.taxa).toFixed(0)}%`}
            comparacao={
              icaMunicipal.total_estado != null
                ? {
                    rotulo: 'UF',
                    valor: `${Number(icaMunicipal.total_estado).toFixed(0)}%`,
                    delta: Number(icaMunicipal.taxa) - Number(icaMunicipal.total_estado),
                    unidade: ' pp',
                  }
                : icaMunicipal.total_brasil != null
                  ? {
                      rotulo: 'Brasil',
                      valor: `${Number(icaMunicipal.total_brasil).toFixed(0)}%`,
                      delta: Number(icaMunicipal.taxa) - Number(icaMunicipal.total_brasil),
                      unidade: ' pp',
                    }
                  : null
            }
          />
        )}
        {idebRecentePorEtapa && (
          <KpiCard
            icon={GraduationCap}
            label={`Ideb agregado ${ETAPA_LABEL[idebRecentePorEtapa.etapa] || idebRecentePorEtapa.etapa}`}
            ano={idebRecentePorEtapa.ano}
            valor={Number(idebRecentePorEtapa.idebAvg).toFixed(1)}
            comparacao={{
              rotulo: 'baseado em',
              valor: `${idebRecentePorEtapa.totalEscolas} ${idebRecentePorEtapa.totalEscolas === 1 ? 'escola' : 'escolas'}`,
              delta: null,
            }}
          />
        )}
        {enemRecente?.mediaGeralPonderada != null && (
          <KpiCard
            icon={TrendingUp}
            label="ENEM rede"
            ano={enemRecente.ano}
            valor={Number(enemRecente.mediaGeralPonderada).toFixed(0)}
            sufixo=" pts"
            comparacao={
              enemRecente.mediaRedacaoPonderada != null
                ? {
                    rotulo: 'redação',
                    valor: `${Number(enemRecente.mediaRedacaoPonderada).toFixed(0)} pts`,
                    delta: null,
                  }
                : { rotulo: 'escolas com 10+', valor: `${enemRecente.escolasCom10}`, delta: null }
            }
          />
        )}
        {fundebRecente && (
          <KpiCard
            icon={Coins}
            label="FUNDEB · valor aluno/ano"
            ano={fundebRecente.ano}
            valor={fmtMoeda(fundebRecente.valor_aluno_ano)}
            comparacao={
              fundebRecente.matriculas_consideradas != null
                ? {
                    rotulo: 'matrículas',
                    valor: fmtMilhar(fundebRecente.matriculas_consideradas),
                    delta: null,
                  }
                : null
            }
          />
        )}
      </div>

      {/* Comparativo vs municípios vizinhos (microrregião) */}
      {(benchmarks?.length || 0) > 0 && (idebRecentePorEtapa || icaMunicipal) && (
        <div
          className="rounded-2xl border p-5 mb-6 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <p className="text-[11px] tracking-[0.15em] uppercase font-bold text-white/55 mb-4">
            Comparativo com vizinhos
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 480 }}>
              <thead>
                <tr className="text-left text-white/45 text-[11px] uppercase tracking-wider">
                  <th className="pb-3 pr-4">Indicador</th>
                  <th className="pb-3 pr-4 text-cyan-300/90">Este município</th>
                  <th className="pb-3 pr-4">Microrregião</th>
                  <th className="pb-3 pr-4">UF</th>
                  <th className="pb-3">Brasil</th>
                </tr>
              </thead>
              <tbody className="text-white/85">
                {icaMunicipal && (() => {
                  const cidade = benchmarks.find((b) => b.scope === 'cidade');
                  const microB = benchmarks.find((b) => b.scope === 'microrregiao');
                  const estado = benchmarks.find((b) => b.scope === 'estado');
                  const brasil = benchmarks.find((b) => b.scope === 'brasil');
                  const v = cidade?.ica_taxa != null ? Number(cidade.ica_taxa) : Number(icaMunicipal.taxa);
                  const vMicro = microB?.ica_taxa != null ? Number(microB.ica_taxa) : null;
                  return (
                    <BenchmarkRowEl
                      indicador={`ICA · ${icaMunicipal.ano}`}
                      esta={`${v.toFixed(0)}%`}
                      micro={vMicro != null ? `${vMicro.toFixed(0)}%` : '—'}
                      estado={estado?.ica_taxa != null ? `${Number(estado.ica_taxa).toFixed(0)}%` : '—'}
                      brasil={brasil?.ica_taxa != null ? `${Number(brasil.ica_taxa).toFixed(0)}%` : '—'}
                      deltaMicro={vMicro != null ? v - vMicro : null}
                      sufixo="pp"
                      qtdMicro={microB?.qtd_munis || null}
                    />
                  );
                })()}
                {idebRecentePorEtapa && (() => {
                  const etapa = idebRecentePorEtapa.etapa;
                  const key = etapa === '5_EF' ? 'ideb_5ef' : etapa === '9_EF' ? 'ideb_9ef' : 'ideb_3em';
                  const cidade = benchmarks.find((b) => b.scope === 'cidade');
                  const microB = benchmarks.find((b) => b.scope === 'microrregiao');
                  const estado = benchmarks.find((b) => b.scope === 'estado');
                  const brasil = benchmarks.find((b) => b.scope === 'brasil');
                  const v = Number(idebRecentePorEtapa.idebAvg);
                  const vMicro = (microB as any)?.[key] != null ? Number((microB as any)[key]) : null;
                  return (
                    <BenchmarkRowEl
                      indicador={`Ideb ${ETAPA_LABEL[etapa] || etapa} · ${idebRecentePorEtapa.ano}`}
                      esta={v.toFixed(1)}
                      micro={vMicro != null ? vMicro.toFixed(1) : '—'}
                      estado={(estado as any)?.[key] != null ? Number((estado as any)[key]).toFixed(1) : '—'}
                      brasil={(brasil as any)?.[key] != null ? Number((brasil as any)[key]).toFixed(1) : '—'}
                      deltaMicro={vMicro != null ? v - vMicro : null}
                      sufixo=""
                      qtdMicro={microB?.qtd_munis || null}
                    />
                  );
                })()}
              </tbody>
            </table>
          </div>
          {benchmarks.find((b) => b.scope === 'microrregiao')?.qtd_munis != null && (
            <p className="text-[11px] text-white/40 mt-3 italic leading-relaxed">
              Microrregião: média entre {benchmarks.find((b) => b.scope === 'microrregiao')?.qtd_munis} municípios
              vizinhos da mesma microrregião IBGE. Comparação contextualmente mais justa que UF/Brasil.
            </p>
          )}
        </div>
      )}

      {/* Trajetória ICA + Ideb */}
      {(icaTimeline.length >= 2 || idebTimeline.length >= 2) && (
        <div
          className="rounded-2xl border p-5 mb-6"
          style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <p className="text-[11px] tracking-[0.15em] uppercase font-bold text-white/55 mb-4">
            Trajetória da rede
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {icaTimeline.length >= 2 && (
              <MiniTimeline
                label="ICA · alfabetização"
                cor="#34c5cc"
                pontos={icaTimeline.map((i) => ({ ano: i.ano, valor: Number(i.taxa) }))}
                sufixo="%"
              />
            )}
            {idebTimeline.length >= 2 && (
              <MiniTimeline
                label={`Ideb ${ETAPA_LABEL[idebRecentePorEtapa!.etapa] || idebRecentePorEtapa!.etapa} · agregado`}
                cor="#9e4edd"
                pontos={idebTimeline.map((r) => ({ ano: r.ano, valor: Number(r.idebAvg) }))}
                decimais={1}
              />
            )}
          </div>
        </div>
      )}

      {/* VAAR — destaque para secretarias */}
      {vaar && (
        <div
          className="rounded-2xl border p-5"
          style={{
            background: vaar.habilitado ? 'rgba(22,163,74,0.08)' : 'rgba(251,191,36,0.06)',
            borderColor: vaar.habilitado ? 'rgba(22,163,74,0.30)' : 'rgba(251,191,36,0.25)',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: vaar.habilitado ? 'rgba(22,163,74,0.18)' : 'rgba(251,191,36,0.18)' }}
            >
              <Award size={16} style={{ color: vaar.habilitado ? '#86efac' : '#fbbf24' }} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] tracking-[0.18em] uppercase font-bold mb-1" style={{ color: vaar.habilitado ? '#86efac' : '#fbbf24' }}>
                VAAR · {vaar.ano}
              </p>
              <h3 className="text-white text-[15px] font-bold mb-2">
                {vaar.habilitado === true ? 'Município habilitado ao VAAR' : vaar.habilitado === false ? 'Município ainda não habilitado' : 'Status VAAR não disponível'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] text-white/75">
                <VaarRow label="Beneficiário direto" valor={vaar.beneficiario} />
                <VaarRow label="Evoluiu atendimento" valor={vaar.evoluiu_atendimento} />
                <VaarRow label="Evoluiu aprendizagem" valor={vaar.evoluiu_aprendizagem} />
              </div>
              <p className="text-[11px] text-white/45 mt-3 italic leading-relaxed">
                VAAR/FUNDEB premia redes que apresentam evolução em atendimento e aprendizagem. A Vertho apoia
                a prontidão da rede com formação, evidências e gestão pedagógica.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function KpiCard({
  icon: Icon, label, ano, valor, sufixo, comparacao,
}: {
  icon: any;
  label: string;
  ano: number | null;
  valor: string;
  sufixo?: string;
  comparacao: { rotulo: string; valor: string; delta: number | null; unidade?: string } | null;
}) {
  const deltaCor = comparacao?.delta == null ? '#94A3B8' : comparacao.delta > 0 ? '#86efac' : comparacao.delta < 0 ? '#fca5a5' : '#94A3B8';
  const deltaIcon = comparacao?.delta == null ? Minus : comparacao.delta > 0 ? ArrowUp : comparacao.delta < 0 ? ArrowDown : Minus;
  const DeltaIcon = deltaIcon;
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} style={{ color: '#34c5cc' }} />
        <p className="text-[10px] tracking-[0.15em] uppercase font-bold text-white/55">
          {label}{ano != null && <span className="text-white/35"> · {ano}</span>}
        </p>
      </div>
      <p className="text-white" style={{
        fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
        fontSize: 32, fontWeight: 600, lineHeight: 1.1,
      }}>
        {valor}{sufixo && <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.40)' }}>{sufixo}</span>}
      </p>
      {comparacao && (
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-white/55">
          <DeltaIcon size={11} style={{ color: deltaCor }} />
          <span>
            {comparacao.rotulo}: <span className="text-white/85 font-bold">{comparacao.valor}{comparacao.unidade && comparacao.delta != null ? '' : ''}</span>
            {comparacao.delta != null && (
              <span className="ml-1" style={{ color: deltaCor }}>
                ({comparacao.delta > 0 ? '+' : ''}{Math.abs(comparacao.delta) < 1 ? comparacao.delta.toFixed(2) : comparacao.delta.toFixed(0)}{comparacao.unidade || ''})
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function BenchmarkRowEl({
  indicador, esta, micro, estado, brasil, deltaMicro, sufixo, qtdMicro,
}: {
  indicador: string;
  esta: string;
  micro: string;
  estado: string;
  brasil: string;
  deltaMicro: number | null;
  sufixo: string;
  qtdMicro: number | null;
}) {
  const corDelta = deltaMicro == null ? '#94A3B8' : deltaMicro > 0 ? '#86efac' : deltaMicro < 0 ? '#fca5a5' : '#94A3B8';
  const sinal = deltaMicro == null ? '' : deltaMicro > 0 ? '+' : '';
  return (
    <tr className="border-t border-white/[0.05]">
      <td className="py-3 pr-4 text-white/65">{indicador}</td>
      <td className="py-3 pr-4 font-bold text-white">
        {esta}
        {deltaMicro != null && (
          <span className="ml-2 text-[11px]" style={{ color: corDelta }}>
            ({sinal}{Math.abs(deltaMicro) < 1 ? deltaMicro.toFixed(2) : deltaMicro.toFixed(0)}{sufixo ? ` ${sufixo}` : ''})
          </span>
        )}
      </td>
      <td className="py-3 pr-4">{micro}</td>
      <td className="py-3 pr-4">{estado}</td>
      <td className="py-3">{brasil}</td>
    </tr>
  );
}

function VaarRow({ label, valor }: { label: string; valor: boolean | null }) {
  const cor = valor === true ? '#86efac' : valor === false ? '#fca5a5' : '#94A3B8';
  const Icon = valor === true ? CheckCircle2 : valor === false ? AlertCircle : Minus;
  return (
    <div className="flex items-center gap-2">
      <Icon size={12} style={{ color: cor }} />
      <span className="text-white/65">{label}:</span>
      <span className="font-bold" style={{ color: cor }}>
        {valor === true ? 'sim' : valor === false ? 'não' : 'n/d'}
      </span>
    </div>
  );
}

function MiniTimeline({
  label, cor, pontos, sufixo, decimais,
}: { label: string; cor: string; pontos: { ano: number; valor: number }[]; sufixo?: string; decimais?: number }) {
  if (pontos.length < 2) return null;
  const W = 280, H = 70, P = { l: 8, r: 8, t: 14, b: 18 };
  const valores = pontos.map((p) => p.valor);
  const yMin = Math.min(...valores) * 0.95;
  const yMax = Math.max(...valores) * 1.05;
  const xMin = pontos[0].ano;
  const xMax = pontos[pontos.length - 1].ano;
  const x = (ano: number) => P.l + ((ano - xMin) / Math.max(1, xMax - xMin)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - ((v - yMin) / Math.max(0.001, yMax - yMin)) * (H - P.t - P.b);
  const path = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.ano).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' ');
  const ultimo = pontos[pontos.length - 1];
  const primeiro = pontos[0];
  const delta = ultimo.valor - primeiro.valor;
  const dec = decimais ?? 0;
  const deltaCor = delta > 0.1 ? '#86efac' : delta < -0.1 ? '#fca5a5' : '#94A3B8';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-[11px] font-bold text-white/85">{label}</p>
        <p className="text-[10px] text-white/45 font-mono">
          {primeiro.ano}–{ultimo.ano} ·{' '}
          <span style={{ color: deltaCor }}>
            {delta > 0 ? '+' : ''}{delta.toFixed(dec)}{sufixo || ''}
          </span>
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[70px]" style={{ overflow: 'visible' }}>
        <path d={path} fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {pontos.map((p, i) => (
          <g key={i}>
            <circle cx={x(p.ano)} cy={y(p.valor)} r={3} fill={cor} />
            <text x={x(p.ano)} y={y(p.valor) - 8} textAnchor="middle" fontSize={9.5} fill="rgba(255,255,255,0.7)" fontFamily="var(--font-jakarta)">
              {p.valor.toFixed(dec)}{sufixo || ''}
            </text>
            <text x={x(p.ano)} y={H - 5} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.4)" fontFamily="var(--font-jakarta)">
              {p.ano}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
