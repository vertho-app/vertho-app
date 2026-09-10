import type { EngagementCargoMetric, EngagementEvolutionDashboard } from '@/lib/engagement-evolution';
import { BLOCKER_META, type EngagementBlocker } from './prioridades';

export type Audience = 'gestor' | 'rh';
export type Signal = 'critical' | 'attention' | 'positive';
export type TrendPoint = { label: string; activation: number; consumption: number; evidence: number };
type Metric = { count: number; pct: number; delta: number };
export type ReportPriority = {
  key: EngagementBlocker; label: string; count: number; pct: number; action: string;
  guidance: string; owner: string; deadline: string;
  members: Array<{ name: string; context: string; id?: string; week?: number }>;
};
export type ReportView = {
  eyebrow: string; scope: string; thesis: string; thesisAccent: string; explanation: string;
  eligible: number; week: number; enrolled: number; previousEligible: number | null;
  hasWeeklyData: boolean; canCompare: boolean;
  activation: Metric; consumption: Metric; evidence: Metric;
  risk: { total: number; critical: number; attention: number };
  recovered: number; tutor: string; preferredFormat: string; trend: TrendPoint[];
  cargos: Array<EngagementCargoMetric & { acao: string }>;
  priorities: ReportPriority[];
  actionPlan: Array<{ title: string; description: string; owner: string; deadline: string }>;
  focusTitle: string; focusSubtitle: string;
  focusItems: Array<{
    name: string; context: string; reason: string; signal: Signal; label: string;
    id?: string; week?: number;
  }>;
};

function acaoPorCargo(cargo: EngagementCargoMetric): string {
  if (!cargo.elegiveis) return 'Acompanhar a semana atual das turmas; este cargo ainda não chegou ao fechamento.';
  const gaps = [
    { count: cargo.elegiveis - cargo.ativados, text: 'sem ativação. Confirmar acesso e combinar o primeiro contato com o conteúdo.' },
    { count: cargo.ativados - cargo.consumiram, text: 'com ativação, mas sem consumo concluído. Reservar tempo para concluir o conteúdo.' },
    { count: cargo.consumiram - cargo.evidencias, text: 'com consumo concluído, mas sem evidência. Orientar o registro da aplicação prática.' },
  ].sort((a, b) => b.count - a.count);
  const gap = gaps[0];
  if (gap.count > 0) return `${gap.count} ${gap.count === 1 ? 'pessoa' : 'pessoas'} ${gap.text}`;
  return cargo.emRisco
    ? 'Fechamento completo entre os elegíveis. Acompanhar as trajetórias em risco e possíveis quedas em relação à semana anterior.'
    : 'Reconhecer a participação e sustentar a aplicação prática.';
}

const FORMATO_LABEL: Record<string, string> = { video: 'Vídeo', audio: 'Áudio', texto: 'Texto', case: 'Caso' };
function formatoPreferidoTexto(items: any[]): string {
  const best = [...(items || [])].filter((item) => item?.principal > 0)
    .sort((a, b) => b.engajou / b.principal - a.engajou / a.principal || b.engajou - a.engajou)[0];
  return best ? `${FORMATO_LABEL[best.formato] || best.formato} · ${Math.round(best.engajou / best.principal * 100)}%` : 'Sem registro';
}

/** Tela e PDF compartilham os mesmos números, bases, grupos e próximas ações. */
export function buildViews({ empresaNome, rollup, evolucao }: {
  empresaNome: string; rollup: any; evolucao: EngagementEvolutionDashboard | null;
}): Record<Audience, ReportView> | null {
  // Falha da evolução não pode ser disfarçada de relatório semanal acumulado.
  if (!evolucao || rollup?.resumo?.erro) return null;
  const last = evolucao.semanas.at(-1);
  const previous = evolucao.semanas.at(-2);
  const week = last?.semana || 0;
  const eligible = last?.elegiveis || 0;
  const metric = (count: number, pct: number, previousPct?: number): Metric => ({ count, pct, delta: previousPct == null ? 0 : pct - previousPct });
  const activation = metric(last?.ativados || 0, last?.ativacaoPct || 0, previous?.ativacaoPct);
  const consumption = metric(last?.consumiram || 0, last?.consumoPct || 0, previous?.consumoPct);
  const evidence = metric(last?.evidencias || 0, last?.evidenciaPct || 0, previous?.evidenciaPct);
  const counts: Record<EngagementBlocker, number> = {
    ativacao: Math.max(0, eligible - activation.count),
    consumo: Math.max(0, activation.count - consumption.count),
    evidencia: Math.max(0, consumption.count - evidence.count),
  };
  const priorityKeys = (Object.keys(counts) as EngagementBlocker[])
    .filter((key) => counts[key] > 0).sort((a, b) => counts[b] - counts[a]);
  const main = priorityKeys[0];
  const groupDescription: Record<EngagementBlocker, string> = {
    ativacao: 'estão sem ativação registrada', consumo: 'ativaram, mas não concluíram o consumo', evidencia: 'consumiram, mas ainda não registraram evidência',
  };
  const explanation = main
    ? `${counts[main]} de ${eligible} pessoas elegíveis ${groupDescription[main]} na semana ${week}. ${main === 'ativacao'
      ? 'A ausência de atividade não identifica a causa: verificar envio, acesso e registro dos eventos antes de abordar o grupo.'
      : BLOCKER_META[main].guidance}`
    : eligible ? `${evidence.count} de ${eligible} pessoas elegíveis concluíram a evidência na semana ${week}. Acompanhar também as trajetórias individuais das demais turmas.`
      : 'Não há fechamento semanal disponível para este recorte. Nenhum indicador foi substituído pelo histórico acumulado.';

  const people = [...evolucao.pessoasEmRisco].sort((a, b) =>
    Number(b.trajetoria === 'critical') - Number(a.trajetoria === 'critical')
    || a.indiceAtual - b.indiceAtual || a.delta - b.delta || a.nome.localeCompare(b.nome, 'pt-BR'));
  const areaRisk = new Map<string, { total: number; critical: number }>();
  for (const person of people) {
    const area = person.area || 'Sem área';
    const entry = areaRisk.get(area) || { total: 0, critical: 0 };
    entry.total += 1;
    if (person.trajetoria === 'critical') entry.critical += 1;
    areaRisk.set(area, entry);
  }
  // Totais consolidados prevalecem mesmo se um consumidor fornecer lista nominal parcial.
  for (const area of evolucao.areas) {
    if (area.emRisco > 0) areaRisk.set(area.area, { total: area.emRisco, critical: areaRisk.get(area.area)?.critical || 0 });
  }
  const areaTotals = new Map(evolucao.areas.map((area) => [area.area, area.participantes]));
  const areas = [...areaRisk].sort(([aName, a], [bName, b]) => b.critical - a.critical || b.total - a.total
    || b.total / Math.max(1, areaTotals.get(bName) || 0) - a.total / Math.max(1, areaTotals.get(aName) || 0)
    || aName.localeCompare(bName, 'pt-BR'));
  const plan = main ? [
    { title: BLOCKER_META[main].action, description: BLOCKER_META[main].guidance, owner: BLOCKER_META[main].owner, deadline: BLOCKER_META[main].deadline },
    { title: 'Combinar a próxima ação com o grupo', description: 'Revisar o motivo da pendência e os sinais de cada pessoa. Definir o responsável e preparar uma orientação específica para o bloqueio encontrado.', owner: 'Gestor da equipe', deadline: 'Após a verificação' },
    { title: 'Reavaliar o mesmo grupo', description: 'Na próxima leitura, conferir quem avançou de etapa e quem continua pendente. Registrar o resultado no acompanhamento da equipe.', owner: 'Gestor e RH', deadline: 'Em 48 horas, como sugestão' },
  ] : [{ title: 'Revisar as trajetórias individuais', description: 'Acompanhar outras turmas e reconhecer quem recuperou o ritmo.', owner: 'Gestor e RH', deadline: 'Próxima reunião de acompanhamento' }];

  function view(audience: Audience): ReportView {
    return {
      eyebrow: audience === 'gestor' ? 'Leitura do gestor' : 'Leitura de RH / Diretoria',
      scope: `${empresaNome} · ${audience === 'gestor' ? 'por pessoa e cargo' : 'por área e cargo'}`,
      thesis: main ? `${counts[main]} pessoas com ${main === 'ativacao' ? 'ativação' : main === 'consumo' ? 'consumo' : 'evidência'} pendente.`
        : eligible ? 'A base semanal concluiu a jornada.' : 'Sem fechamento semanal disponível.',
      thesisAccent: main ? BLOCKER_META[main].action : 'Revisar o acompanhamento das turmas.',
      explanation, eligible, week, enrolled: evolucao.inscritos, previousEligible: previous?.elegiveis ?? null,
      hasWeeklyData: Boolean(last), canCompare: Boolean(previous && previous.elegiveis > 0 && eligible > 0),
      activation, consumption, evidence,
      risk: { total: evolucao.emRisco, critical: evolucao.trajetorias.critical, attention: evolucao.trajetorias.attention },
      recovered: evolucao.recuperados, tutor: `${last?.usaramTutor || 0} de ${eligible}`,
      preferredFormat: formatoPreferidoTexto(rollup?.resumo?.porFormato),
      trend: evolucao.semanas.slice(-4).map((w) => ({ label: `S${w.semana}`, activation: w.ativacaoPct, consumption: w.consumoPct, evidence: w.evidenciaPct })),
      cargos: (evolucao.cargos || []).map((cargo) => ({ ...cargo, acao: acaoPorCargo(cargo) })),
      priorities: priorityKeys.map((key) => {
        const members = (evolucao.pendenciasSemana || []).filter((person) => person.pendencia === key);
        const byArea = new Map<string, number>();
        for (const person of members) byArea.set(person.area, (byArea.get(person.area) || 0) + 1);
        return {
          key, ...BLOCKER_META[key], count: counts[key], pct: eligible ? Math.round(counts[key] / eligible * 100) : 0,
          members: audience === 'gestor'
            ? members.map((person) => ({ name: person.nome, context: [person.cargo, person.area].filter(Boolean).join(' · '), id: person.colaboradorId, week }))
            : [...byArea].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, context: `${count} pessoas com esta pendência na semana ${week}` })),
        };
      }),
      actionPlan: audience === 'rh' ? plan.map((action, index) => index === 1 ? {
        title: 'Alinhar o plano com os gestores das áreas', description: 'Priorizar as áreas com mais trajetórias críticas e maior proporção de pessoas afetadas. Combinar o apoio, o responsável e a data de revisão.', owner: 'RH e gestores das áreas', deadline: 'Após a verificação',
      } : action) : plan,
      focusTitle: audience === 'gestor' ? 'Trajetórias que pedem acompanhamento' : 'Áreas que pedem acompanhamento',
      focusSubtitle: `Base: ${evolucao.inscritos} inscritos, cada pessoa na sua semana atual. ${audience === 'gestor' ? 'Até 3 prioridades, com trajetórias críticas primeiro.' : 'Ordenação por trajetórias críticas, quantidade e proporção de pessoas afetadas.'}`,
      focusItems: audience === 'gestor' ? people.slice(0, 3).map((person) => ({
        name: person.nome, context: [person.cargo, person.area, `Semana ${person.semanaAtual}`].filter(Boolean).join(' · '),
        reason: person.motivo, signal: person.trajetoria === 'critical' ? 'critical' : 'attention',
        label: person.trajetoria === 'critical' ? 'Crítico' : 'Atenção', id: person.colaboradorId, week: person.semanaAtual,
      })) : areas.slice(0, 3).map(([area, risk]) => {
        const total = areaTotals.get(area) || 0;
        return { name: area, context: total ? `${risk.total} pessoas em risco · ${total} inscritos · ${Math.round(risk.total / total * 100)}% da área` : `${risk.total} pessoas em acompanhamento`,
          reason: `${risk.critical} em trajetória crítica · ${risk.total - risk.critical} em atenção. Alinhar o plano com o gestor da área.`,
          signal: risk.critical ? 'critical' : 'attention', label: risk.critical ? 'Trajetórias críticas' : 'Atenção' };
      }),
    };
  }
  return { gestor: view('gestor'), rh: view('rh') };
}
