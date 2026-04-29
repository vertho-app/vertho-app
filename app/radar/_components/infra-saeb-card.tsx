import { Building, ArrowRight } from 'lucide-react';
import type { EscolaInfraSaeb, EscolaN0Row, Quadrante } from '@/lib/radar/queries';

const ETAPA_LABEL: Record<string, string> = {
  '5_EF': '5º EF',
  '9_EF': '9º EF',
  '3_EM': '3º EM',
};
const DISC_LABEL: Record<string, string> = {
  LP: 'Língua Portuguesa',
  MAT: 'Matemática',
};

const QUADRANTE_INFO: Record<Quadrante, {
  titulo: string;
  cor: string;
  fundo: string;
  borda: string;
  narrativa: string;
}> = {
  q1_bem_servida_aprende: {
    titulo: 'Bem servida e bem-sucedida',
    cor: '#6EE7B7',
    fundo: 'rgba(110,231,183,0.08)',
    borda: 'rgba(110,231,183,0.25)',
    narrativa: 'Infraestrutura acima da mediana nacional e percentual de alunos no nível 0 abaixo da mediana — o cenário virtuoso onde estrutura e aprendizagem caminham juntas.',
  },
  q2_estrutura_resultado_baixo: {
    titulo: 'Estrutura ok, aprendizagem fraca',
    cor: '#FCD34D',
    fundo: 'rgba(252,211,77,0.08)',
    borda: 'rgba(252,211,77,0.25)',
    narrativa: 'Infraestrutura acima da mediana nacional, mas percentual de alunos no nível 0 acima — o gargalo é provavelmente pedagógico/gestor, não físico.',
  },
  q3_faz_mais_com_menos: {
    titulo: 'Faz mais com menos',
    cor: '#9AE2E6',
    fundo: 'rgba(154,226,230,0.08)',
    borda: 'rgba(154,226,230,0.25)',
    narrativa: 'Infraestrutura abaixo da mediana, mas percentual de alunos no nível 0 também abaixo — sinal de boas práticas pedagógicas que merecem documentação.',
  },
  q4_dupla_vulnerabilidade: {
    titulo: 'Dupla vulnerabilidade',
    cor: '#F97354',
    fundo: 'rgba(249,115,84,0.08)',
    borda: 'rgba(249,115,84,0.25)',
    narrativa: 'Infraestrutura abaixo da mediana e percentual de alunos no nível 0 acima — o cenário que mais demanda intervenção concomitante de infra e pedagogia.',
  },
  sem_dados: {
    titulo: 'Dados insuficientes',
    cor: 'rgba(255,255,255,0.4)',
    fundo: 'rgba(255,255,255,0.03)',
    borda: 'rgba(255,255,255,0.08)',
    narrativa: 'A escola não tem Censo ou Saeb suficientes para classificação no quadrante.',
  },
};

function ScoreBar({ valor, label }: { valor: number | null; label: string }) {
  const v = valor ?? 0;
  return (
    <div>
      <div className="flex justify-between text-[10px] text-white/55 mb-1 font-mono">
        <span>{label}</span>
        <span className="font-bold text-white/80">{valor != null ? v.toFixed(0) + '%' : '—'}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, v))}%`,
            background: v >= 60 ? '#6EE7B7' : v >= 40 ? '#FCD34D' : '#F97354',
          }} />
      </div>
    </div>
  );
}

function N0Row({ row }: { row: EscolaN0Row }) {
  const diff = row.diff_mediana;
  const tone = diff > 5 ? 'pior' : diff < -5 ? 'melhor' : 'neutro';
  const cor = tone === 'pior' ? '#F97354' : tone === 'melhor' ? '#6EE7B7' : 'rgba(255,255,255,0.4)';
  return (
    <div className="grid grid-cols-12 gap-3 py-2 border-b border-white/[0.04] last:border-b-0 text-xs">
      <div className="col-span-5 text-white/75">
        {ETAPA_LABEL[row.etapa] || row.etapa} · {DISC_LABEL[row.disciplina] || row.disciplina}
      </div>
      <div className="col-span-2 text-right font-mono text-white">
        {row.pct_n0_escola.toFixed(1)}%
      </div>
      <div className="col-span-3 text-right font-mono text-white/45">
        {row.pct_n0_mediana_brasil.toFixed(1)}% <span className="text-white/30">BR</span>
      </div>
      <div className="col-span-2 text-right font-mono font-bold" style={{ color: cor }}>
        {diff >= 0 ? '+' : ''}{diff.toFixed(1)}
      </div>
    </div>
  );
}

export function InfraSaebCard({
  resumo,
  breakdown,
}: {
  resumo: EscolaInfraSaeb | null;
  breakdown: EscolaN0Row[];
}) {
  if (!resumo) return null;
  if (resumo.quadrante === 'sem_dados' && breakdown.length === 0) return null;

  const q = QUADRANTE_INFO[resumo.quadrante];

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Building size={18} style={{ color: '#34c5cc' }} />
        <h2 className="text-white text-xl font-bold">
          Infraestrutura × Desempenho (Saeb {resumo.saeb_ano || ''})
        </h2>
      </div>
      <p className="text-xs text-white/55 mb-4 leading-relaxed">
        Cruzamento entre o score de infraestrutura do Censo Escolar e o percentual de
        alunos no nível 0 do Saeb (insuficiência crítica). O nível 0 da escola é
        comparado com a mediana nacional <em>da mesma etapa e disciplina</em> —
        importante porque a mediana de nível 0 varia muito entre 5º EF (~3%) e
        9º EF/3º EM (~15-17%).
      </p>

      <div className="rounded-2xl p-5 border mb-4"
        style={{ background: q.fundo, borderColor: q.borda }}>
        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
          <div>
            <p className="text-[9px] tracking-[0.25em] uppercase font-mono text-white/55 mb-1">
              Quadrante
            </p>
            <p className="text-2xl font-bold" style={{ color: q.cor }}>{q.titulo}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] tracking-[0.25em] uppercase font-mono text-white/55 mb-1">
              Score infra geral
            </p>
            <p className="text-2xl font-bold font-mono text-white">
              {resumo.score_geral != null ? resumo.score_geral.toFixed(0) + '%' : '—'}
            </p>
          </div>
        </div>
        <p className="text-xs text-white/70 leading-relaxed">{q.narrativa}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="rounded-2xl p-4 border border-white/[0.06]"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/40 mb-3">
            Sub-scores Censo Escolar
          </p>
          <div className="space-y-2.5">
            <ScoreBar valor={resumo.score_basica}        label="Básica" />
            <ScoreBar valor={resumo.score_pedagogica}    label="Pedagógica" />
            <ScoreBar valor={resumo.score_acessibilidade} label="Acessibilidade" />
            <ScoreBar valor={resumo.score_conectividade}  label="Conectividade" />
          </div>
        </div>

        <div className="rounded-2xl p-4 border border-white/[0.06]"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-[9px] tracking-[0.2em] uppercase font-mono text-white/40 mb-3">
            % no nível 0 do Saeb · escola vs mediana BR
          </p>
          {breakdown.length > 0 ? (
            <>
              <div className="grid grid-cols-12 gap-3 pb-2 border-b border-white/[0.06] text-[9px] tracking-wider uppercase font-mono text-white/30">
                <div className="col-span-5">Etapa · Disciplina</div>
                <div className="col-span-2 text-right">Esta esc.</div>
                <div className="col-span-3 text-right">Brasil</div>
                <div className="col-span-2 text-right">Δ</div>
              </div>
              {breakdown.map((row, i) => <N0Row key={i} row={row} />)}
            </>
          ) : (
            <p className="text-xs text-white/45 italic">Sem snapshot Saeb disponível.</p>
          )}
        </div>
      </div>

      <p className="text-[10px] text-white/40">
        Fonte: INEP — Censo Escolar (4 dimensões de infra) × Saeb {resumo.saeb_ano || ''}
        (distribuição por nível). Quadrantes: corte em score 60% e diferença 0 vs mediana nacional.
      </p>
    </section>
  );
}
