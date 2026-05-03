'use client';

import { GraduationCap, BookOpen, Target, TrendingDown, TrendingUp, Sparkles, ArrowRight, Layers, Wifi, Users, MessagesSquare } from 'lucide-react';
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
  saeb, ideb, enem, censo, quadrante, escolaNome,
}: {
  saeb: any[];
  ideb: any[];
  enem: any[];
  censo: any | null;
  quadrante: string | null;
  escolaNome: string;
}): Frente[] {
  const frentes: Frente[] = [];

  // 1. Saeb pctN0-1 — formação docente OU consolidação de boas práticas
  // Olha LP e MAT separadamente do snapshot mais recente da etapa principal
  const saebOrdenado = [...saeb].sort((a, b) => b.ano - a.ano);
  const etapaPrincipal = (() => {
    const counts: Record<string, number> = {};
    for (const s of saebOrdenado) counts[s.etapa] = (counts[s.etapa] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  })();
  const ultimoAnoSaeb = saebOrdenado[0]?.ano;
  const saebLP = etapaPrincipal && ultimoAnoSaeb
    ? saebOrdenado.find((s) => s.etapa === etapaPrincipal && s.disciplina === 'LP' && s.ano === ultimoAnoSaeb)
    : null;
  const saebMAT = etapaPrincipal && ultimoAnoSaeb
    ? saebOrdenado.find((s) => s.etapa === etapaPrincipal && s.disciplina === 'MAT' && s.ano === ultimoAnoSaeb)
    : null;

  for (const [s, disc, habilidade] of [
    [saebLP, 'Língua Portuguesa', 'compreensão leitora e produção textual'],
    [saebMAT, 'Matemática', 'numeracia e raciocínio lógico'],
  ] as const) {
    if (!s?.distribuicao) continue;
    const pctN01 = (Number((s as any).distribuicao['0'] || 0) + Number((s as any).distribuicao['1'] || 0));
    if (pctN01 > 30) {
      frentes.push({
        icon: BookOpen,
        cor: 'cyan',
        titulo: `Formação docente em ${disc}`,
        evidencia: `${pctN01.toFixed(0)}% dos alunos do ${ETAPA_LABEL[(s as any).etapa] || (s as any).etapa} nos níveis 0-1 em ${disc} · Saeb ${(s as any).ano}`,
        atuacao: `Trilha de formação docente aplicada com foco em ${habilidade}, MentorIA acompanhando a prática semanal e evidências registradas por professor.`,
      });
    } else if (pctN01 < 15 && pctN01 > 0) {
      frentes.push({
        icon: Sparkles,
        cor: 'green',
        titulo: `Consolidar prática em ${disc}`,
        evidencia: `Apenas ${pctN01.toFixed(0)}% dos alunos no nível 0-1 em ${disc} · Saeb ${(s as any).ano} — resultado superior à média da rede`,
        atuacao: `Documentação estruturada da prática que está funcionando, formação para replicar com novos professores e dossiê de evidências interno e para a rede.`,
      });
    }
  }

  // Saeb participação baixa — engajamento dos estudantes
  const saebPart = saebLP || saebOrdenado[0];
  if (saebPart?.taxa_participacao != null && saebPart.taxa_participacao < 75) {
    frentes.push({
      icon: Users,
      cor: 'amber',
      titulo: 'Engajamento dos estudantes na avaliação',
      evidencia: `Apenas ${Number(saebPart.taxa_participacao).toFixed(0)}% dos alunos elegíveis participaram do Saeb ${saebPart.ano} — baixa participação compromete a leitura do diagnóstico`,
      atuacao: `Diagnóstico das causas de evasão na avaliação, mobilização da comunidade escolar e alinhamento da equipe sobre o uso pedagógico do Saeb.`,
    });
  }

  // 2. ENEM — múltiplas frentes (forte / intermediário / gap entre áreas / redação fraca)
  const enemRecente = [...enem].sort((a, b) => b.ano - a.ano)[0];
  if (enemRecente?.media_geral != null) {
    const m = Number(enemRecente.media_geral);
    const ano = enemRecente.ano;
    const areas = [
      { k: 'CN', nome: 'Ciências da Natureza', v: enemRecente.media_cn },
      { k: 'CH', nome: 'Ciências Humanas', v: enemRecente.media_ch },
      { k: 'LC', nome: 'Linguagens e Códigos', v: enemRecente.media_lc },
      { k: 'MT', nome: 'Matemática', v: enemRecente.media_mt },
    ].filter((a) => a.v != null).map((a) => ({ ...a, v: Number(a.v) }));

    // 2.a — gap entre áreas
    if (areas.length >= 3) {
      const max = areas.reduce((a, b) => (a.v > b.v ? a : b));
      const min = areas.reduce((a, b) => (a.v < b.v ? a : b));
      const spread = max.v - min.v;
      if (spread >= 80) {
        frentes.push({
          icon: Target,
          cor: 'purple',
          titulo: 'Trilha para área defasada do 3º EM',
          evidencia: `Gap de ${spread.toFixed(0)} pts no ENEM ${ano} entre ${max.nome} (${max.v.toFixed(0)}) e ${min.nome} (${min.v.toFixed(0)})`,
          atuacao: `Formação docente focada em ${min.nome}, simulações ENEM com MentorIA e plano de preparação dos concluintes por área.`,
        });
      }
    }

    // 2.b — média alta (manter excelência) ou média baixa (preparação dirigida)
    if (m >= 600) {
      frentes.push({
        icon: Sparkles,
        cor: 'green',
        titulo: 'Manter excelência no ENEM',
        evidencia: `Média geral ${m.toFixed(0)} pts no ENEM ${ano} — patamar de elite${enemRecente.media_redacao != null ? `, redação ${Number(enemRecente.media_redacao).toFixed(0)} pts` : ''}`,
        atuacao: `Trilhas avançadas para concluintes, mentoria por área de afinidade vocacional e acompanhamento de desempenho com benchmarks de excelência.`,
      });
    } else if (m < 480) {
      frentes.push({
        icon: TrendingUp,
        cor: 'amber',
        titulo: 'Plano dirigido de preparação para o 3º EM',
        evidencia: `Média geral ${m.toFixed(0)} pts no ENEM ${ano} — patamar abaixo da referência das redes públicas`,
        atuacao: `Mapeamento individual dos concluintes, trilhas por área defasada, simulações guiadas com MentorIA e plano semanal de revisão de habilidades-chave.`,
      });
    }

    // 2.c — redação fraca (gap específico)
    if (enemRecente.media_redacao != null && Number(enemRecente.media_redacao) < 500) {
      frentes.push({
        icon: MessagesSquare,
        cor: 'amber',
        titulo: 'Formação focada em produção textual',
        evidencia: `Média de redação ${Number(enemRecente.media_redacao).toFixed(0)} pts no ENEM ${ano} — habilidade que pode ser destravada com formação dirigida`,
        atuacao: `Trilha de produção textual para professores de Linguagens, ciclos de feedback escrito com MentorIA e bancos de redações modelo da escola.`,
      });
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

  // 4. Tendência Ideb — queda OU alta
  if (ordenadoIdeb.length >= 2) {
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
        } else if (delta >= 0.5) {
          frentes.push({
            icon: TrendingUp,
            cor: 'green',
            titulo: 'Sustentar trajetória de melhoria',
            evidencia: `Ideb ${ETAPA_LABEL[etapa] || etapa} subiu ${delta.toFixed(1)} pts entre ${series[0].ano} (${v0.toFixed(1)}) e ${series[series.length - 1].ano} (${v1.toFixed(1)}) — tendência positiva confirmada`,
            atuacao: `Documentação dos fatores que destravaram o crescimento, formação para escalar a prática e MentorIA dando suporte aos professores que sustentam o ciclo.`,
          });
        }
      }
    }
  }

  // 4b. Censo conectividade alta — uso pedagógico de tecnologia
  if (censo?.score_conectividade != null && Number(censo.score_conectividade) >= 80) {
    frentes.push({
      icon: Wifi,
      cor: 'cyan',
      titulo: 'Uso pedagógico da tecnologia já instalada',
      evidencia: `Conectividade ${Number(censo.score_conectividade).toFixed(0)}/100 (Censo Escolar) — infraestrutura digital robusta sem uso pedagógico equivalente é uma alavanca subaproveitada`,
      atuacao: `Formação docente em metodologias com tecnologia, MentorIA destravando experimentação e plano de adoção pedagógica do que já está instalado.`,
    });
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
  escolaNome, saeb, ideb, enem, censo, quadrante,
}: {
  escolaNome: string;
  saeb: any[];
  ideb: any[];
  enem: any[];
  censo: any | null;
  quadrante: string | null;
}) {
  const frentes = detectarFrentes({ saeb, ideb, enem, censo, quadrante, escolaNome });
  if (!frentes.length) return null;

  return (
    <section className="mb-10">
      <div className="mb-5">
        <p className="eyebrow-manrope text-cyan-300/85 mb-2">Onde a Vertho pode ajudar</p>
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
