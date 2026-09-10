import type { EngagementEvolutionDashboard } from '@/lib/engagement-evolution';

export type Audience = 'gestor' | 'rh';
export type Signal = 'critical' | 'attention' | 'positive';

export type TrendPoint = {
  label: string;
  activation: number;
  consumption: number;
  evidence: number;
};

export type ReportView = {
  eyebrow: string;
  scope: string;
  thesis: string;
  thesisAccent: string;
  explanation: string;
  eligible: number;
  activation: { count: number; pct: number; delta: number };
  consumption: { count: number; pct: number; delta: number };
  evidence: { count: number; pct: number; delta: number };
  risk: { total: number; critical: number; attention: number };
  recovered: number;
  tutor: string;
  preferredFormat: string;
  trend: TrendPoint[];
  focusTitle: string;
  focusSubtitle: string;
  focusItems: Array<{
    name: string;
    context: string;
    reason: string;
    signal: Signal;
    label: string;
  }>;
};

const FORMATO_LABEL: Record<string, string> = {
  video: 'Vídeo',
  audio: 'Áudio',
  texto: 'Texto',
  case: 'Caso',
};

/** Mesma régua de "tem sinal" da tela de engajamento: qualquer movimento conta. */
function temSinalReal(pessoa: any): boolean {
  return Boolean(
    pessoa.abriuLink
    || pessoa.formatosAbertos?.length
    || pessoa.consumiu
    || pessoa.enviouEvidencia
    || pessoa.conversouTutor,
  );
}

function formatoPreferidoTexto(porFormato: any[]): string {
  const itens = (porFormato || []).filter((i) => i && i.principal > 0);
  if (!itens.length) return '—';
  const melhor = [...itens].sort((a, b) => {
    const ra = a.engajou / Math.max(1, a.principal);
    const rb = b.engajou / Math.max(1, b.principal);
    return rb - ra || b.engajou - a.engajou;
  })[0];
  const pct = Math.round((melhor.engajou / Math.max(1, melhor.principal)) * 100);
  return `${FORMATO_LABEL[melhor.formato] || melhor.formato} · ${pct}%`;
}

function teseGestor(input: {
  eligible: number;
  activationCount: number;
  activationPct: number;
  consumptionCount: number;
  consumptionPct: number;
  evidenceCount: number;
  evidencePct: number;
  semanaAtual: number;
}): Pick<ReportView, 'thesis' | 'thesisAccent' | 'explanation'> {
  const { eligible, activationCount, activationPct, consumptionCount, consumptionPct, evidenceCount, evidencePct, semanaAtual } = input;
  if (!eligible) {
    return {
      thesis: 'Sem participantes na cadência.',
      thesisAccent: 'Nada a acompanhar nesta semana.',
      explanation: 'Nenhum colaborador inscrito na cadência até o momento. Assim que as turmas entrarem, este relatório passa a mostrar o fio de engajamento.',
    };
  }
  const semAtivacao = eligible - activationCount;
  if (activationPct < 60) {
    return {
      thesis: 'A ativação travou.',
      thesisAccent: 'O risco começa no primeiro clique.',
      explanation: `${semAtivacao} de ${eligible} pessoas não chegaram à ativação na semana ${semanaAtual}. Antes de cobrar consumo ou evidência, a conversa é sobre abertura: link, acesso e primeiro contato com o conteúdo.`,
    };
  }
  if (evidencePct < 50 && consumptionPct - evidencePct >= 10) {
    return {
      thesis: 'O consumo avançou.',
      thesisAccent: 'A prática ficou para trás.',
      explanation: `${consumptionCount} pessoas consumiram o conteúdo, mas ${consumptionCount - evidenceCount} ficaram sem transformar o aprendizado em evidência prática. É aí que a conversa do gestor decide a semana.`,
    };
  }
  if (evidencePct >= 60) {
    return {
      thesis: 'O ritmo está saudável.',
      thesisAccent: 'Sustentar o movimento.',
      explanation: `${evidenceCount} de ${eligible} pessoas fecharam a semana com evidência prática. O trabalho agora é sustentar: reconhecer quem recuperou o ritmo e acompanhar quem oscilou.`,
    };
  }
  return {
    thesis: 'O movimento segue.',
    thesisAccent: 'A evidência decide a semana.',
    explanation: `Ativação em ${activationPct}% e consumo em ${consumptionPct}%, com evidência em ${evidencePct}%. O gargalo está entre consumir e registrar a prática — é onde cada conversa rende mais.`,
  };
}

function teseRh(input: {
  eligible: number;
  evidencePct: number;
  emRisco: number;
  topAreas: Array<{ area: string; count: number }>;
}): Pick<ReportView, 'thesis' | 'thesisAccent' | 'explanation'> {
  const { eligible, evidencePct, emRisco, topAreas } = input;
  if (!eligible) {
    return {
      thesis: 'Sem base para leitura.',
      thesisAccent: 'Nenhum participante inscrito.',
      explanation: 'Ainda não há colaboradores na cadência. A leitura por área aparece automaticamente com a entrada das turmas.',
    };
  }
  const top2 = topAreas.slice(0, 2);
  const concentrado = top2.reduce((s, a) => s + a.count, 0);
  if (emRisco > 0 && top2.length === 2 && concentrado >= Math.ceil(emRisco * 0.6)) {
    return {
      thesis: 'O ritmo geral segue.',
      thesisAccent: 'O risco está concentrado.',
      explanation: `${top2[0].area} e ${top2[1].area} reúnem ${concentrado} das ${emRisco} pessoas em risco (evidência em ${evidencePct}%). A mobilização dos gestores dessas áreas produz mais efeito do que uma comunicação geral.`,
    };
  }
  if (emRisco === 0) {
    return {
      thesis: 'O ritmo geral é saudável.',
      thesisAccent: 'Ninguém em risco nesta semana.',
      explanation: `Todas as áreas fecharam a semana sem trajetórias de atenção ou críticas, com evidência em ${evidencePct}%. O foco passa a ser sustentar o ritmo.`,
    };
  }
  const areaTop = topAreas[0];
  return {
    thesis: 'O ritmo geral segue.',
    thesisAccent: 'O risco está distribuído.',
    explanation: `${emRisco} pessoas em risco espalhadas pelas áreas${areaTop ? ` — ${areaTop.area} lidera com ${areaTop.count}.` : '.'} Evidência em ${evidencePct}%: a alavanca é a conversa de cada gestor com o seu time.`,
  };
}

export function buildViews(args: {
  empresaNome: string;
  rollup: any;
  evolucao: EngagementEvolutionDashboard | null;
}): Record<Audience, ReportView> | null {
  const { empresaNome, rollup, evolucao } = args;
  const resumo = rollup?.resumo;
  const semanasEvolucao = evolucao?.semanas || [];
  const last = semanasEvolucao.at(-1);
  const prev = semanasEvolucao.at(-2);

  // Régua única: o fechamento atual (última semana da evolução) comanda os
  // números, a tendência e os deltas — mesma base, mesma régua.
  const semanaAtual = last?.semana ?? evolucao?.semanaAtual ?? 0;
  const eligible = last?.elegiveis ?? resumo?.inscritos ?? evolucao?.inscritos ?? 0;

  let activation = { count: 0, pct: 0, delta: 0 };
  let consumption = { count: 0, pct: 0, delta: 0 };
  let evidence = { count: 0, pct: 0, delta: 0 };
  let tutorCount = 0;

  if (last) {
    activation = {
      count: last.ativados,
      pct: last.ativacaoPct,
      delta: prev ? last.ativacaoPct - prev.ativacaoPct : 0,
    };
    consumption = {
      count: last.consumiram,
      pct: last.consumoPct,
      delta: prev ? last.consumoPct - prev.consumoPct : 0,
    };
    evidence = {
      count: last.evidencias,
      pct: last.evidenciaPct,
      delta: prev ? last.evidenciaPct - prev.evidenciaPct : 0,
    };
    tutorCount = last.usaramTutor;
  } else if (resumo) {
    // Sem histórico semanal: agregado atual, sem delta alegado.
    const pctOf = (n: number) => (eligible > 0 ? Math.round((n / eligible) * 100) : 0);
    activation = { count: resumo.abriramLink || 0, pct: pctOf(resumo.abriramLink || 0), delta: 0 };
    consumption = { count: resumo.consumiram || 0, pct: pctOf(resumo.consumiram || 0), delta: 0 };
    evidence = { count: resumo.enviaramEvidencia || 0, pct: pctOf(resumo.enviaramEvidencia || 0), delta: 0 };
    tutorCount = resumo.conversaramTutor || 0;
  } else {
    return null;
  }

  const riskTotal = evolucao?.emRisco ?? 0;
  const riskCritical = evolucao?.trajetorias?.critical ?? 0;
  const riskAttention = evolucao?.trajetorias?.attention ?? Math.max(0, riskTotal - riskCritical);
  const recovered = evolucao?.recuperados ?? 0;
  const preferredFormat = formatoPreferidoTexto(resumo?.porFormato || []);

  const trend: TrendPoint[] = semanasEvolucao.slice(-4).map((w) => ({
    label: `S${w.semana}`,
    activation: w.ativacaoPct,
    consumption: w.consumoPct,
    evidence: w.evidenciaPct,
  }));

  // ── Foco do gestor: pessoas, críticas primeiro (já vem ordenado do núcleo).
  let gestorItems: ReportView['focusItems'] = (evolucao?.pessoasEmRisco || []).slice(0, 3).map((p) => ({
    name: p.nome,
    context: [p.cargo, p.area].filter(Boolean).join(' · ') || `Semana ${p.semanaAtual}`,
    reason: p.motivo,
    signal: (p.trajetoria === 'critical' ? 'critical' : 'attention') as Signal,
    label: p.trajetoria === 'critical' ? 'Crítico' : 'Atenção',
  }));
  if (!gestorItems.length && Array.isArray(rollup?.colaboradores)) {
    const candidatos = (rollup.colaboradores as any[])
      .filter((c) => c.jornadaAtrasada || !temSinalReal(c) || !c.enviouEvidencia)
      .sort((a, b) => Number(!temSinalReal(a)) - Number(!temSinalReal(b)) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
      .slice(0, 3);
    gestorItems = candidatos.map((c) => {
      const critico = !temSinalReal(c) || c.jornadaAtrasada;
      return {
        name: c.nome,
        context: c.cargo || 'Cargo não informado',
        reason: c.jornadaAtrasada
          ? 'Etapa da jornada em atraso.'
          : !temSinalReal(c)
            ? 'Sem atividade registrada no período.'
            : 'Consumiu o conteúdo; falta registrar a evidência.',
        signal: (critico ? 'critical' : 'attention') as Signal,
        label: critico ? 'Crítico' : 'Atenção',
      };
    });
  }

  // ── Foco do RH: áreas, nunca nomes (a mensagem do WhatsApp não nominaliza).
  const riscoPorArea = new Map<string, number>();
  for (const p of evolucao?.pessoasEmRisco || []) {
    riscoPorArea.set(p.area, (riscoPorArea.get(p.area) || 0) + 1);
  }
  const tendenciaPorArea = new Map((evolucao?.areas || []).map((a) => [a.area, a] as const));
  const topAreas = [...riscoPorArea.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area, 'pt-BR'));
  let rhItems: ReportView['focusItems'] = topAreas.slice(0, 3).map((item, index) => {
    const meta = tendenciaPorArea.get(item.area);
    const tendencia = meta?.tendencia;
    const reason = tendencia != null && tendencia < 0
      ? `Índice de engajamento caiu ${Math.abs(tendencia)} pontos no fechamento.`
      : tendencia != null && tendencia > 0
        ? `Em risco apesar da alta de ${tendencia} pontos — acompanhar de perto.`
        : `${item.count} ${item.count === 1 ? 'pessoa em risco' : 'pessoas em risco'} nesta área.`;
    return {
      name: item.area,
      context: `${item.count} ${item.count === 1 ? 'pessoa em risco' : 'pessoas em risco'}${meta ? ` · ${meta.participantes} participantes` : ''}`,
      reason,
      signal: (index < 2 ? 'critical' : 'attention') as Signal,
      label: `Prioridade ${index + 1}`,
    };
  });
  if (!rhItems.length && (evolucao?.areas || []).length) {
    rhItems = [{
      name: 'Nenhuma área em risco',
      context: `${evolucao!.areas.length} ${evolucao!.areas.length === 1 ? 'área acompanhada' : 'áreas acompanhadas'}`,
      reason: 'Todas as áreas fecharam a semana sem trajetórias de atenção ou críticas.',
      signal: 'positive' as Signal,
      label: 'Sustentar',
    }];
  }

  const teseG = teseGestor({
    eligible,
    activationCount: activation.count,
    activationPct: activation.pct,
    consumptionCount: consumption.count,
    consumptionPct: consumption.pct,
    evidenceCount: evidence.count,
    evidencePct: evidence.pct,
    semanaAtual,
  });
  const teseR = teseRh({ eligible, evidencePct: evidence.pct, emRisco: riskTotal, topAreas });

  return {
    gestor: {
      eyebrow: 'Leitura do gestor',
      scope: `${empresaNome} · por pessoa`,
      ...teseG,
      eligible,
      activation,
      consumption,
      evidence,
      risk: { total: riskTotal, critical: riskCritical, attention: riskAttention },
      recovered,
      tutor: `${tutorCount} de ${eligible}`,
      preferredFormat,
      trend,
      focusTitle: 'Agir nesta semana',
      focusSubtitle: 'Ordem sugerida para as conversas de acompanhamento.',
      focusItems: gestorItems,
    },
    rh: {
      eyebrow: 'Leitura de RH / Diretoria',
      scope: `${empresaNome} · por área`,
      ...teseR,
      eligible,
      activation,
      consumption,
      evidence,
      risk: { total: riskTotal, critical: riskCritical, attention: riskAttention },
      recovered,
      tutor: `${tutorCount} de ${eligible}`,
      preferredFormat,
      trend,
      focusTitle: 'Áreas para mobilizar',
      focusSubtitle: 'Nomes individuais ficam protegidos no detalhe autenticado.',
      focusItems: rhItems,
    },
  };
}
