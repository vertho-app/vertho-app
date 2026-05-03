'use client';

import { TrendingUp, BookOpen, GraduationCap, Layers, ArrowDown, ArrowUp, Minus } from 'lucide-react';

type SaebLite = {
  ano: number;
  etapa: string;
  disciplina: string;
  media_proficiencia: number | null;
  taxa_participacao?: number | null;
  distribuicao?: Record<string, number> | null;
};

type IdebLite = {
  ano: number;
  etapa: string;
  ideb: number | null;
  meta?: number | null;
};

type EnemLite = {
  ano: number;
  media_geral: number | null;
  media_redacao?: number | null;
  media_mt?: number | null;
  media_lc?: number | null;
};

type CensoLite = {
  score_basica: number | null;
  score_pedagogica: number | null;
  score_acessibilidade: number | null;
  score_conectividade: number | null;
};

type BenchmarkRow = {
  scope: 'escola' | 'microrregiao' | 'estado';
  ideb_5ef: number | null;
  ideb_9ef: number | null;
  ideb_3em: number | null;
  saeb_5ef_lp: number | null;
  saeb_5ef_mat: number | null;
  saeb_9ef_lp: number | null;
  saeb_9ef_mat: number | null;
  saeb_3em_lp: number | null;
  saeb_3em_mat: number | null;
  inse_grupo: number | null;
};

type Quadrante = 'q1_bem_servida_aprende' | 'q2_estrutura_resultado_baixo' | 'q3_faz_mais_com_menos' | 'q4_dupla_vulnerabilidade' | 'sem_dados';

const ETAPA_LABEL: Record<string, string> = {
  '5_EF': '5º EF',
  '9_EF': '9º EF',
  '3_EM': '3º EM',
};

function pickEtapaPrincipal(saeb: SaebLite[]): string | null {
  if (!saeb.length) return null;
  const counts: Record<string, number> = {};
  for (const s of saeb) counts[s.etapa] = (counts[s.etapa] || 0) + 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || null;
}

function pickIdebPrincipal(ideb: IdebLite[]): IdebLite | null {
  if (!ideb.length) return null;
  const counts: Record<string, number> = {};
  for (const r of ideb) counts[r.etapa] = (counts[r.etapa] || 0) + 1;
  const etapa = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!etapa) return null;
  return ideb.filter((r) => r.etapa === etapa && r.ideb != null).sort((a, b) => b.ano - a.ano)[0] || null;
}

function censoMedia(c: CensoLite | null): number | null {
  if (!c) return null;
  const vs = [c.score_basica, c.score_pedagogica, c.score_acessibilidade, c.score_conectividade]
    .filter((v) => v != null) as number[];
  if (!vs.length) return null;
  return vs.reduce((a, b) => a + b, 0) / vs.length;
}

const QUADRANTE_INFO: Record<Quadrante, { titulo: string; texto: string; cor: string; bg: string }> = {
  q1_bem_servida_aprende: {
    titulo: 'Bem servida e bem-sucedida',
    texto: 'Infra acima da mediana nacional e nível 0 do Saeb abaixo. Cenário virtuoso — espaço para consolidar boas práticas.',
    cor: '#86efac',
    bg: 'rgba(22,163,74,0.10)',
  },
  q2_estrutura_resultado_baixo: {
    titulo: 'Estrutura ok, aprendizagem fraca',
    texto: 'Infra acima da mediana mas alunos no nível 0 acima. O gargalo é pedagógico/gestor, não físico — exatamente onde a Vertho atua.',
    cor: '#fbbf24',
    bg: 'rgba(251,191,36,0.10)',
  },
  q3_faz_mais_com_menos: {
    titulo: 'Faz mais com menos',
    texto: 'Apesar da infra abaixo da mediana, alunos no nível 0 abaixo da mediana. Boas práticas a documentar e replicar.',
    cor: '#34c5cc',
    bg: 'rgba(52,197,204,0.10)',
  },
  q4_dupla_vulnerabilidade: {
    titulo: 'Dupla vulnerabilidade',
    texto: 'Infra abaixo + nível 0 acima da mediana nacional. Demanda intervenção concomitante (Vertho atua na frente pedagógica/gestora).',
    cor: '#fca5a5',
    bg: 'rgba(220,38,38,0.10)',
  },
  sem_dados: { titulo: '', texto: '', cor: '#94A3B8', bg: 'rgba(148,163,184,0.05)' },
};

export function PanoramaEscola({
  saeb, ideb, enem, censo, benchmarks, quadrante,
}: {
  saeb: SaebLite[];
  ideb: IdebLite[];
  enem: EnemLite[];
  censo: CensoLite | null;
  benchmarks: BenchmarkRow[];
  quadrante: Quadrante | null;
}) {
  const idebRecente = pickIdebPrincipal(ideb);
  const etapaSaeb = pickEtapaPrincipal(saeb);
  const saebLP = etapaSaeb
    ? saeb.filter((s) => s.etapa === etapaSaeb && s.disciplina === 'LP' && s.media_proficiencia != null).sort((a, b) => b.ano - a.ano)
    : [];
  const saebMAT = etapaSaeb
    ? saeb.filter((s) => s.etapa === etapaSaeb && s.disciplina === 'MAT' && s.media_proficiencia != null).sort((a, b) => b.ano - a.ano)
    : [];
  const enemRecente = [...enem].sort((a, b) => b.ano - a.ano)[0] || null;
  const censoMed = censoMedia(censo);

  const micro = benchmarks.find((b) => b.scope === 'microrregiao');
  const estado = benchmarks.find((b) => b.scope === 'estado');

  // Ideb deltas para benchmark
  const idebKey = idebRecente?.etapa === '5_EF' ? 'ideb_5ef' : idebRecente?.etapa === '9_EF' ? 'ideb_9ef' : 'ideb_3em';
  const idebMicro = micro?.[idebKey] ?? null;
  const idebEstado = estado?.[idebKey] ?? null;

  // Saeb LP deltas
  const saebLPKey = etapaSaeb ? `saeb_${etapaSaeb.toLowerCase()}_lp` as const : null;
  const saebLPRec = saebLP[0] || null;
  const saebLPMicro = saebLPKey ? (micro as any)?.[saebLPKey] ?? null : null;
  const saebLPEstado = saebLPKey ? (estado as any)?.[saebLPKey] ?? null : null;

  // Mini timeline data (LP até 6 anos)
  const timelineLP = saebLP.slice().sort((a, b) => a.ano - b.ano).slice(-6);
  const timelineMAT = saebMAT.slice().sort((a, b) => a.ano - b.ano).slice(-6);

  const hasAnyKpi = idebRecente || saebLPRec || enemRecente || censoMed != null;
  if (!hasAnyKpi) return null;

  return (
    <section className="mb-10">
      <p className="eyebrow-manrope text-cyan-300/85 mb-2">Panorama da escola</p>
      <h2 className="text-white mb-5" style={{
        fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
        fontSize: 'clamp(22px, 2.6vw, 28px)',
        fontWeight: 600,
        letterSpacing: '-0.02em',
      }}>
        Indicadores principais
      </h2>

      {/* KPI Strip — até 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {idebRecente && (
          <KpiCard
            icon={GraduationCap}
            label={`Ideb ${ETAPA_LABEL[idebRecente.etapa] || idebRecente.etapa}`}
            ano={idebRecente.ano}
            valor={idebRecente.ideb!.toFixed(1)}
            comparacao={
              idebRecente.meta != null
                ? { rotulo: 'meta', valor: Number(idebRecente.meta).toFixed(1), delta: idebRecente.ideb! - Number(idebRecente.meta) }
                : idebMicro != null
                  ? { rotulo: 'micro', valor: Number(idebMicro).toFixed(1), delta: idebRecente.ideb! - Number(idebMicro) }
                  : null
            }
          />
        )}
        {saebLPRec && (
          <KpiCard
            icon={BookOpen}
            label={`Saeb LP ${ETAPA_LABEL[etapaSaeb!] || etapaSaeb}`}
            ano={saebLPRec.ano}
            valor={saebLPRec.media_proficiencia!.toFixed(0)}
            sufixo=" pts"
            comparacao={
              saebLPMicro != null
                ? { rotulo: 'micro', valor: Number(saebLPMicro).toFixed(0), delta: saebLPRec.media_proficiencia! - Number(saebLPMicro), unidade: ' pts' }
                : null
            }
          />
        )}
        {enemRecente?.media_geral != null && (
          <KpiCard
            icon={TrendingUp}
            label="ENEM média"
            ano={enemRecente.ano}
            valor={Number(enemRecente.media_geral).toFixed(0)}
            sufixo=" pts"
            comparacao={
              enemRecente.media_redacao != null
                ? { rotulo: 'redação', valor: Number(enemRecente.media_redacao).toFixed(0), delta: null, unidade: ' pts' }
                : null
            }
          />
        )}
        {censoMed != null && (
          <KpiCard
            icon={Layers}
            label="Censo · score geral"
            ano={null}
            valor={censoMed.toFixed(0)}
            sufixo="/100"
            comparacao={null}
          />
        )}
      </div>

      {/* Benchmark mini table — Ideb e Saeb LP */}
      {(idebRecente || saebLPRec) && (idebMicro != null || saebLPMicro != null) && (
        <div
          className="rounded-2xl border p-5 mb-6 overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <p className="text-[11px] tracking-[0.15em] uppercase font-bold text-white/55 mb-4">
            Comparativo com pares
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" style={{ minWidth: 480 }}>
              <thead>
                <tr className="text-left text-white/45 text-[11px] uppercase tracking-wider">
                  <th className="pb-3 pr-4">Indicador</th>
                  <th className="pb-3 pr-4 text-cyan-300/90">Esta escola</th>
                  <th className="pb-3 pr-4">Microrregião</th>
                  <th className="pb-3">Estado</th>
                </tr>
              </thead>
              <tbody className="text-white/85">
                {idebRecente && (
                  <BenchmarkRowEl
                    indicador={`Ideb ${ETAPA_LABEL[idebRecente.etapa] || idebRecente.etapa} · ${idebRecente.ano}`}
                    escola={idebRecente.ideb!.toFixed(1)}
                    micro={idebMicro != null ? Number(idebMicro).toFixed(1) : '—'}
                    estado={idebEstado != null ? Number(idebEstado).toFixed(1) : '—'}
                    deltaMicro={idebMicro != null ? idebRecente.ideb! - Number(idebMicro) : null}
                  />
                )}
                {saebLPRec && (
                  <BenchmarkRowEl
                    indicador={`Saeb LP ${ETAPA_LABEL[etapaSaeb!] || etapaSaeb} · ${saebLPRec.ano}`}
                    escola={`${saebLPRec.media_proficiencia!.toFixed(0)} pts`}
                    micro={saebLPMicro != null ? `${Number(saebLPMicro).toFixed(0)} pts` : '—'}
                    estado={saebLPEstado != null ? `${Number(saebLPEstado).toFixed(0)} pts` : '—'}
                    deltaMicro={saebLPMicro != null ? saebLPRec.media_proficiencia! - Number(saebLPMicro) : null}
                  />
                )}
              </tbody>
            </table>
          </div>
          {micro?.inse_grupo != null && (
            <p className="text-[11px] text-white/40 mt-3 italic leading-relaxed">
              Microrregião: média entre escolas com perfil INSE comparável (Grupo {micro.inse_grupo}).
              Estado: média estadual completa.
            </p>
          )}
        </div>
      )}

      {/* Mini timeline Saeb — LP + MAT */}
      {(timelineLP.length >= 2 || timelineMAT.length >= 2) && (
        <div
          className="rounded-2xl border p-5 mb-6"
          style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <p className="text-[11px] tracking-[0.15em] uppercase font-bold text-white/55 mb-4">
            Trajetória Saeb · {ETAPA_LABEL[etapaSaeb!] || etapaSaeb}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {timelineLP.length >= 2 && <MiniTimeline label="Língua Portuguesa" cor="#34c5cc" pontos={timelineLP.map((s) => ({ ano: s.ano, valor: s.media_proficiencia! }))} />}
            {timelineMAT.length >= 2 && <MiniTimeline label="Matemática" cor="#9e4edd" pontos={timelineMAT.map((s) => ({ ano: s.ano, valor: s.media_proficiencia! }))} />}
          </div>
        </div>
      )}

      {/* Quadrante Infra×Saeb */}
      {quadrante && quadrante !== 'sem_dados' && (
        <div
          className="rounded-2xl border p-5"
          style={{ background: QUADRANTE_INFO[quadrante].bg, borderColor: `${QUADRANTE_INFO[quadrante].cor}40` }}
        >
          <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-2" style={{ color: QUADRANTE_INFO[quadrante].cor }}>
            Cruzamento Infraestrutura × Saeb
          </p>
          <h3 className="text-white text-lg font-bold mb-2">{QUADRANTE_INFO[quadrante].titulo}</h3>
          <p className="text-white/75 text-[13px] leading-relaxed">{QUADRANTE_INFO[quadrante].texto}</p>
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
            {comparacao.rotulo}: <span className="text-white/85 font-bold">{comparacao.valor}{comparacao.unidade || ''}</span>
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
  indicador, escola, micro, estado, deltaMicro,
}: { indicador: string; escola: string; micro: string; estado: string; deltaMicro: number | null }) {
  const corDelta = deltaMicro == null ? '#94A3B8' : deltaMicro > 0 ? '#86efac' : deltaMicro < 0 ? '#fca5a5' : '#94A3B8';
  const sinal = deltaMicro == null ? '' : deltaMicro > 0 ? '+' : '';
  return (
    <tr className="border-t border-white/[0.05]">
      <td className="py-3 pr-4 text-white/65">{indicador}</td>
      <td className="py-3 pr-4 font-bold text-white">
        {escola}
        {deltaMicro != null && (
          <span className="ml-2 text-[11px]" style={{ color: corDelta }}>
            ({sinal}{Math.abs(deltaMicro) < 1 ? deltaMicro.toFixed(2) : deltaMicro.toFixed(0)})
          </span>
        )}
      </td>
      <td className="py-3 pr-4">{micro}</td>
      <td className="py-3">{estado}</td>
    </tr>
  );
}

function MiniTimeline({ label, cor, pontos }: { label: string; cor: string; pontos: { ano: number; valor: number }[] }) {
  if (pontos.length < 2) return null;
  const W = 280, H = 70, P = { l: 8, r: 8, t: 14, b: 18 };
  const valores = pontos.map((p) => p.valor);
  const yMin = Math.min(...valores) - 10;
  const yMax = Math.max(...valores) + 10;
  const xMin = pontos[0].ano;
  const xMax = pontos[pontos.length - 1].ano;
  const x = (ano: number) => P.l + ((ano - xMin) / Math.max(1, xMax - xMin)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - ((v - yMin) / Math.max(1, yMax - yMin)) * (H - P.t - P.b);
  const path = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.ano).toFixed(1)} ${y(p.valor).toFixed(1)}`).join(' ');
  const ultimo = pontos[pontos.length - 1];
  const primeiro = pontos[0];
  const delta = ultimo.valor - primeiro.valor;
  const deltaCor = delta > 5 ? '#86efac' : delta < -5 ? '#fca5a5' : '#94A3B8';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-[11px] font-bold text-white/85">{label}</p>
        <p className="text-[10px] text-white/45 font-mono">
          {primeiro.ano}–{ultimo.ano} ·{' '}
          <span style={{ color: deltaCor }}>
            {delta > 0 ? '+' : ''}{delta.toFixed(0)} pts
          </span>
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[70px]" style={{ overflow: 'visible' }}>
        <path d={path} fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {pontos.map((p, i) => (
          <g key={i}>
            <circle cx={x(p.ano)} cy={y(p.valor)} r={3} fill={cor} />
            <text x={x(p.ano)} y={y(p.valor) - 8} textAnchor="middle" fontSize={9.5} fill="rgba(255,255,255,0.7)" fontFamily="var(--font-jakarta)">
              {p.valor.toFixed(0)}
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
