'use client';

import { GraduationCap, BookOpen, Target, TrendingDown, Sparkles, ArrowRight, Layers } from 'lucide-react';
import { openWhatsAppAgendar } from '../../_lib/whatsapp';
import { WhatsappIcon } from '../../_components/whatsapp-icon';

const ETAPA_LABEL: Record<string, string> = {
  '5_EF': '5º EF',
  '9_EF': '9º EF',
  '3_EM': '3º EM',
};

type Frente = {
  icon: any;
  cor: string; // cyan, purple, green, amber
  titulo: string;
  evidencia: string;
  atuacao: string;
};

const TONS: Record<string, { iconBg: string; iconColor: string; eyebrow: string; border: string }> = {
  cyan: {
    iconBg: 'rgba(52,197,204,0.15)',
    iconColor: '#34c5cc',
    eyebrow: '#34c5cc',
    border: 'rgba(52,197,204,0.22)',
  },
  purple: {
    iconBg: 'rgba(158,78,221,0.15)',
    iconColor: '#c084fc',
    eyebrow: '#c084fc',
    border: 'rgba(158,78,221,0.22)',
  },
  green: {
    iconBg: 'rgba(22,163,74,0.18)',
    iconColor: '#86efac',
    eyebrow: '#86efac',
    border: 'rgba(22,163,74,0.22)',
  },
  amber: {
    iconBg: 'rgba(251,191,36,0.18)',
    iconColor: '#fbbf24',
    eyebrow: '#fbbf24',
    border: 'rgba(251,191,36,0.22)',
  },
};

function detectarFrentes({
  saeb, ideb, enem, quadrante, escolaNome,
}: {
  saeb: any[];
  ideb: any[];
  enem: any[];
  quadrante: string | null;
  escolaNome: string;
}): Frente[] {
  const frentes: Frente[] = [];

  // 1. Formação docente — Saeb pctN0-1 alto
  const saebRecente = [...saeb].sort((a, b) => b.ano - a.ano)[0];
  if (saebRecente?.distribuicao) {
    const pctN01 = (Number(saebRecente.distribuicao['0'] || 0) + Number(saebRecente.distribuicao['1'] || 0));
    if (pctN01 > 30) {
      const disc = saebRecente.disciplina === 'LP' ? 'Língua Portuguesa' : 'Matemática';
      const habilidade = saebRecente.disciplina === 'LP' ? 'compreensão leitora e produção textual' : 'numeracia e raciocínio lógico';
      frentes.push({
        icon: BookOpen,
        cor: 'cyan',
        titulo: `Formação docente em ${disc}`,
        evidencia: `${pctN01.toFixed(0)}% dos alunos do ${ETAPA_LABEL[saebRecente.etapa] || saebRecente.etapa} nos níveis 0-1 em ${disc} · Saeb ${saebRecente.ano}`,
        atuacao: `Trilha de formação docente aplicada com foco em ${habilidade}, MentorIA acompanhando a prática semanal e evidências registradas por professor.`,
      });
    }
  }

  // 2. Trilha por área defasada — ENEM gap
  const enemRecente = [...enem].sort((a, b) => b.ano - a.ano)[0];
  if (enemRecente?.media_geral != null) {
    const areas = [
      { k: 'CN', nome: 'Ciências da Natureza', v: enemRecente.media_cn },
      { k: 'CH', nome: 'Ciências Humanas', v: enemRecente.media_ch },
      { k: 'LC', nome: 'Linguagens e Códigos', v: enemRecente.media_lc },
      { k: 'MT', nome: 'Matemática', v: enemRecente.media_mt },
    ].filter((a) => a.v != null).map((a) => ({ ...a, v: Number(a.v) }));
    if (areas.length >= 3) {
      const max = areas.reduce((a, b) => (a.v > b.v ? a : b));
      const min = areas.reduce((a, b) => (a.v < b.v ? a : b));
      const spread = max.v - min.v;
      if (spread >= 80) {
        frentes.push({
          icon: Target,
          cor: 'purple',
          titulo: 'Trilha para área defasada do 3º EM',
          evidencia: `Gap de ${spread.toFixed(0)} pts no ENEM ${enemRecente.ano} entre ${max.nome} (${max.v.toFixed(0)}) e ${min.nome} (${min.v.toFixed(0)})`,
          atuacao: `Formação docente focada em ${min.nome}, simulações ENEM com MentorIA e plano de preparação dos concluintes por área.`,
        });
      }
    }
  }

  // 3. Assessment + PDI da equipe gestora — Ideb abaixo da meta
  const ordenadoIdeb = [...ideb].sort((a, b) => a.ano - b.ano);
  const idebRecente = ordenadoIdeb[ordenadoIdeb.length - 1];
  if (idebRecente?.ideb != null && idebRecente?.meta != null) {
    const v = Number(idebRecente.ideb);
    const meta = Number(idebRecente.meta);
    const gap = meta - v;
    if (gap >= 0.3) {
      frentes.push({
        icon: GraduationCap,
        cor: 'amber',
        titulo: 'Assessment de competências da gestão',
        evidencia: `Ideb ${idebRecente.ano} = ${v.toFixed(1)} vs meta INEP ${meta.toFixed(1)} · gap de ${gap.toFixed(1)} pts`,
        atuacao: `Diagnóstico DISC e competências da equipe gestora, PDI individualizado por gestor e plano de 90 dias com marcos de evidência.`,
      });
    }
  }

  // 4. Plano de virada — queda do Ideb
  if (ordenadoIdeb.length >= 2) {
    // Filtra a etapa mais frequente
    const counts: Record<string, number> = {};
    for (const r of ideb) counts[r.etapa] = (counts[r.etapa] || 0) + 1;
    const etapa = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (etapa) {
      const series = ideb.filter((r) => r.etapa === etapa && r.ideb != null).sort((a, b) => a.ano - b.ano);
      if (series.length >= 2) {
        const v0 = Number(series[0].ideb);
        const v1 = Number(series[series.length - 1].ideb);
        const delta = v1 - v0;
        if (delta <= -0.5) {
          frentes.push({
            icon: TrendingDown,
            cor: 'amber',
            titulo: 'Plano de virada pedagógico',
            evidencia: `Ideb ${ETAPA_LABEL[etapa] || etapa} caiu ${Math.abs(delta).toFixed(1)} pts entre ${series[0].ano} (${v0.toFixed(1)}) e ${series[series.length - 1].ano} (${v1.toFixed(1)})`,
            atuacao: `Diagnóstico pedagógico imediato com escuta socrática da equipe, plano de virada com marcos de 30/60/90 dias e MentorIA acompanhando os ciclos.`,
          });
        }
      }
    }
  }

  // 5. Quadrante Infra×Saeb
  if (quadrante === 'q2_estrutura_resultado_baixo') {
    frentes.push({
      icon: Sparkles,
      cor: 'amber',
      titulo: 'Sweet spot Vertho — gargalo pedagógico',
      evidencia: `Cenário Q2: infraestrutura acima da mediana, mas alunos no nível 0 do Saeb também acima — o gargalo é prática pedagógica e gestão, não recurso físico`,
      atuacao: `Vertho atua exatamente nessa frente: assessment de competências da equipe, formação docente aplicada e MentorIA destravando a prática que a infra já permite.`,
    });
  } else if (quadrante === 'q3_faz_mais_com_menos') {
    frentes.push({
      icon: Sparkles,
      cor: 'green',
      titulo: 'Documentar e replicar boas práticas',
      evidencia: `Cenário Q3: apesar da infra abaixo da mediana, ${escolaNome} mantém alunos no nível 0 abaixo da mediana nacional — há prática que funciona`,
      atuacao: `Documentação estruturada das práticas pedagógicas + trilha para replicar com o time + dossiê de evidências útil para a rede como um todo.`,
    });
  } else if (quadrante === 'q1_bem_servida_aprende') {
    frentes.push({
      icon: Sparkles,
      cor: 'green',
      titulo: 'Consolidar e elevar o patamar',
      evidencia: `Cenário Q1: infraestrutura e aprendizagem acima da mediana — base sólida para a próxima etapa de excelência`,
      atuacao: `Trilha de excelência com formação avançada, evidências comparativas com escolas de mesmo perfil e PDIs orientados a desafios maiores.`,
    });
  } else if (quadrante === 'q4_dupla_vulnerabilidade') {
    frentes.push({
      icon: Layers,
      cor: 'amber',
      titulo: 'Intervenção pedagógica concomitante',
      evidencia: `Cenário Q4: infraestrutura e aprendizagem ambas abaixo da mediana — atenção concomitante é necessária`,
      atuacao: `Diagnóstico pedagógico/gestor focado, formação docente com priorização por descritor e MentorIA acompanhando o ciclo de melhoria. (Frente de infra fica fora do escopo Vertho.)`,
    });
  }

  return frentes;
}

export function AtuacaoVertho({
  escolaNome, saeb, ideb, enem, quadrante,
}: {
  escolaNome: string;
  saeb: any[];
  ideb: any[];
  enem: any[];
  quadrante: string | null;
}) {
  const frentes = detectarFrentes({ saeb, ideb, enem, quadrante, escolaNome });
  if (!frentes.length) return null;

  return (
    <section className="mb-10">
      <div className="mb-5">
        <p className="eyebrow-manrope text-cyan-300/85 mb-2">Onde a Vertho atua</p>
        <h2 className="text-white" style={{
          fontFamily: 'var(--font-fraunces), "Fraunces", Georgia, serif',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
        }}>
          Como cada sinal vira <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>plano de ação</em>
        </h2>
        <p className="text-white/60 mt-2 leading-relaxed" style={{ fontSize: 14, maxWidth: 720 }}>
          Cada frente é uma resposta direta a um sinal detectado nos dados públicos da escola — nenhuma é genérica.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {frentes.map((f, i) => <FrenteCard key={i} frente={f} />)}
      </div>

      <div className="mt-6 flex justify-center">
        <button
          onClick={() => openWhatsAppAgendar({ tipo: 'cta' })}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all"
          style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', color: '#06172C' }}
        >
          <WhatsappIcon size={14} /> Agendar conversa sobre essas frentes
        </button>
      </div>
    </section>
  );
}

function FrenteCard({ frente }: { frente: Frente }) {
  const Icon = frente.icon;
  const tom = TONS[frente.cor] || TONS.cyan;
  return (
    <div
      className="rounded-2xl p-6 border"
      style={{ background: 'rgba(255,255,255,0.025)', borderColor: tom.border }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: tom.iconBg, color: tom.iconColor }}
        >
          <Icon size={18} strokeWidth={2.2} />
        </div>
        <p className="text-[10px] tracking-[0.18em] uppercase font-bold" style={{ color: tom.eyebrow }}>
          Frente Vertho
        </p>
      </div>
      <h3 className="text-white text-[17px] font-bold leading-tight mb-3" style={{
        fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
      }}>
        {frente.titulo}
      </h3>
      <div
        className="rounded-lg px-3 py-2.5 mb-3 border-l-2"
        style={{ background: 'rgba(255,255,255,0.03)', borderLeftColor: tom.iconColor }}
      >
        <p className="text-[10px] tracking-[0.12em] uppercase font-bold text-white/45 mb-1">Evidência nos dados</p>
        <p className="text-white/85 text-[12.5px] leading-snug">{frente.evidencia}</p>
      </div>
      <p className="text-white/70 text-[13.5px] leading-relaxed">{frente.atuacao}</p>
    </div>
  );
}
