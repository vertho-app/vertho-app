'use client';

import { GraduationCap, BookOpen, Target, Sparkles, Award, Layers, Users } from 'lucide-react';
import { openWhatsAppAgendar } from '../../_lib/whatsapp';
import { WhatsappIcon } from '../../_components/whatsapp-icon';

const ETAPA_LABEL: Record<string, string> = {
  '5_EF': '5º EF',
  '9_EF': '9º EF',
  '3_EM': '3º EM',
};

type Frente = {
  icon: any;
  cor: 'cyan' | 'purple' | 'green' | 'amber';
  titulo: string;
  evidencia: string;
  atuacao: string;
};

const TONS: Record<string, { iconBg: string; iconColor: string; eyebrow: string; border: string }> = {
  cyan:   { iconBg: 'rgba(52,197,204,0.15)', iconColor: '#34c5cc', eyebrow: '#34c5cc', border: 'rgba(52,197,204,0.22)' },
  purple: { iconBg: 'rgba(158,78,221,0.15)', iconColor: '#c084fc', eyebrow: '#c084fc', border: 'rgba(158,78,221,0.22)' },
  green:  { iconBg: 'rgba(22,163,74,0.18)',  iconColor: '#86efac', eyebrow: '#86efac', border: 'rgba(22,163,74,0.22)' },
  amber:  { iconBg: 'rgba(251,191,36,0.18)', iconColor: '#fbbf24', eyebrow: '#fbbf24', border: 'rgba(251,191,36,0.22)' },
};

function detectarFrentes({
  ica, ideb, enem, vaar, redes, nome,
}: {
  ica: any[];
  ideb: any[];
  enem: any[];
  vaar: any | null;
  redes: Record<string, number>;
  nome: string;
}): Frente[] {
  const frentes: Frente[] = [];
  const escolasMunicipais = redes?.MUNICIPAL || 0;

  // 1. ICA — comparação relativa com UF/Brasil (não threshold absoluto)
  const icaRecente = [...ica].filter((i) => (i.rede || '').toUpperCase() === 'MUNICIPAL' && i.taxa != null).sort((a, b) => b.ano - a.ano)[0]
    || [...ica].filter((i) => i.taxa != null).sort((a, b) => b.ano - a.ano)[0];
  if (icaRecente) {
    const taxa = Number(icaRecente.taxa);
    const refUf = icaRecente.total_estado != null ? Number(icaRecente.total_estado) : null;
    const refBr = icaRecente.total_brasil != null ? Number(icaRecente.total_brasil) : null;
    const ref = refUf ?? refBr ?? null;
    const refLabel = refUf != null ? 'UF' : 'Brasil';
    const delta = ref != null ? taxa - ref : null;

    // Frente 1.a — alfabetização crítica (taxa baixa em absoluto OU delta negativo grande)
    if (taxa < 50 || (delta != null && delta <= -10)) {
      frentes.push({
        icon: BookOpen,
        cor: 'cyan',
        titulo: 'Formação dos professores alfabetizadores',
        evidencia: `ICA ${icaRecente.ano} = ${taxa.toFixed(0)}% das crianças do 2º ano EF alfabetizadas${ref != null ? ` (${delta!.toFixed(0)} pp vs ${refLabel} ${ref.toFixed(0)}%)` : ''}`,
        atuacao: 'Trilha de formação aplicada em alfabetização para professores dos anos iniciais, MentorIA acompanhando os ciclos de prática e dossiê de evidências por escola.',
      });
    }
    // Frente 1.b — patamar bom mas com gap entre escolas (sempre cabe formação contínua)
    else if (taxa < 80 && (delta == null || Math.abs(delta) < 5)) {
      frentes.push({
        icon: BookOpen,
        cor: 'cyan',
        titulo: 'Acelerar a curva de alfabetização',
        evidencia: `ICA ${icaRecente.ano} = ${taxa.toFixed(0)}% — alinhado com a média ${refLabel}${ref != null ? ` (${ref.toFixed(0)}%)` : ''}, mas há escolas atrás da curva`,
        atuacao: 'Diagnóstico das escolas com pior performance, formação focada em mediação de leitura e plano de virada para os anos iniciais.',
      });
    }
    // Frente 1.c — resultado forte (taxa alta E acima da UF)
    else if (taxa >= 80 || (delta != null && delta >= 5)) {
      frentes.push({
        icon: Sparkles,
        cor: 'green',
        titulo: 'Documentar e replicar a estratégia de alfabetização',
        evidencia: `ICA ${icaRecente.ano} = ${taxa.toFixed(0)}%${ref != null ? ` (+${delta!.toFixed(0)} pp vs ${refLabel} ${ref.toFixed(0)}%)` : ''} — estratégia que funciona e merece ser sistematizada`,
        atuacao: 'Mapeamento das práticas que sustentam o resultado, formação para escalar dentro da rede e dossiê de evidências para registro institucional e benchmark com municípios vizinhos.',
      });
    }
  }

  // 2. Ideb agregado abaixo de patamar — apoio à gestão pedagógica
  if (ideb.length) {
    const counts: Record<string, number> = {};
    for (const r of ideb) counts[r.etapa] = (counts[r.etapa] || 0) + 1;
    const etapa = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (etapa) {
      const recent = ideb.filter((r: any) => r.etapa === etapa && r.idebAvg != null).sort((a: any, b: any) => b.ano - a.ano)[0];
      if (recent) {
        const v = Number(recent.idebAvg);
        if (v < 5.0) {
          frentes.push({
            icon: GraduationCap,
            cor: 'amber',
            titulo: 'Apoio à gestão pedagógica da rede',
            evidencia: `Ideb agregado ${ETAPA_LABEL[etapa] || etapa} ${recent.ano} = ${v.toFixed(1)} — patamar abaixo do esperado para a rede`,
            atuacao: 'Assessment de competências dos diretores e coordenadores pedagógicos, PDI da equipe gestora e plano de virada com marcos de evidência por escola.',
          });
        } else if (v >= 5.5) {
          frentes.push({
            icon: Sparkles,
            cor: 'green',
            titulo: 'Documentar e replicar boas práticas da rede',
            evidencia: `Ideb agregado ${ETAPA_LABEL[etapa] || etapa} ${recent.ano} = ${v.toFixed(1)} — patamar forte com práticas que merecem ser identificadas`,
            atuacao: 'Mapeamento das escolas que puxam a média, sistematização das práticas pedagógicas que funcionam e trilha para replicar no time.',
          });
        }
      }
    }
  }

  // 3. ENEM agregado fraco — trilha 3º EM
  const enemRecente = [...enem].sort((a, b) => b.ano - a.ano)[0];
  if (enemRecente?.mediaGeralPonderada != null) {
    const m = Number(enemRecente.mediaGeralPonderada);
    if (m < 500) {
      frentes.push({
        icon: Target,
        cor: 'purple',
        titulo: 'Plano de preparação dos concluintes do 3º EM',
        evidencia: `Média ENEM ${enemRecente.ano} da rede = ${m.toFixed(0)} pts (${enemRecente.escolasCom10 || 0} escolas com 10+ participantes)`,
        atuacao: 'Trilha por área do ENEM, simulações conduzidas por MentorIA, formação docente focada nas áreas mais defasadas e acompanhamento individual dos concluintes.',
      });
    }
  }

  // 4. Variabilidade entre escolas municipais — diagnóstico de risco
  if (escolasMunicipais >= 5) {
    frentes.push({
      icon: Layers,
      cor: 'cyan',
      titulo: 'Priorização entre escolas da rede municipal',
      evidencia: `${escolasMunicipais} escolas na rede municipal de ${nome} — variação de performance entre unidades é esperada e detectável nos dados`,
      atuacao: 'Diagnóstico comparativo escola a escola, identificação das que carregam o maior risco pedagógico e plano por grupos com priorização orçamentária da secretaria.',
    });
  }

  // 5. VAAR — prontidão da rede
  if (vaar) {
    if (vaar.habilitado === false) {
      frentes.push({
        icon: Award,
        cor: 'amber',
        titulo: 'Prontidão para o VAAR/FUNDEB',
        evidencia: `Município ${vaar.ano} ainda não habilitado ao VAAR — há condições e evidências de gestão a fortalecer para qualificar à complementação`,
        atuacao: 'Diagnóstico das condições do VAAR, organização de evidências de evolução em atendimento e aprendizagem, formação de gestores escolares e dossiê institucional para qualificação.',
      });
    } else if (vaar.habilitado === true && vaar.evoluiu_aprendizagem === false) {
      frentes.push({
        icon: Award,
        cor: 'amber',
        titulo: 'Manter o VAAR — destravar evolução de aprendizagem',
        evidencia: `Município habilitado ao VAAR ${vaar.ano}, mas sem evolução em aprendizagem registrada no critério`,
        atuacao: 'Assessment pedagógico focado nas escolas que travam a média, formação aplicada para coordenadores e MentorIA destravando ciclos de prática.',
      });
    }
  }

  // 6. Coordenadores pedagógicos — quando a rede municipal tem volume
  if (escolasMunicipais >= 10) {
    frentes.push({
      icon: Users,
      cor: 'purple',
      titulo: 'Formação de coordenadores pedagógicos',
      evidencia: `Rede municipal de ${nome} com ${escolasMunicipais} escolas — coordenação pedagógica é a alavanca de sustentação`,
      atuacao: 'Trilha estruturada para coordenadores pedagógicos com foco em mediação de prática docente, observação de aula e ciclo de melhoria contínua, com MentorIA como copiloto.',
    });
  }

  return frentes;
}

export function AtuacaoVerthoMunicipio({
  ica, ideb, enem, vaar, redes, nome,
}: {
  ica: any[];
  ideb: any[];
  enem: any[];
  vaar: any | null;
  redes: Record<string, number>;
  nome: string;
}) {
  const frentes = detectarFrentes({ ica, ideb, enem, vaar, redes, nome });
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
          Frentes para <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>{nome}</em>
        </h2>
        <p className="text-white/60 mt-2 leading-relaxed" style={{ fontSize: 14, maxWidth: 720 }}>
          Cada frente abaixo é uma resposta direta a um sinal detectado nos dados públicos da rede.
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
