import { AREA_SEM_NOME, type EngagementCargoMetric, type EngagementEvolutionDashboard } from '@/lib/engagement-evolution';
import { blockerMeta, type EngagementBlocker } from './prioridades';
import { motivoDeRisco, rotuloArea, rotuloCargo, type Traduzir } from './rotulos';

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
  audience: Audience; eyebrow: string; scope: string; thesis: string; thesisAccent: string; explanation: string;
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

function acaoPorCargo(t: Traduzir, cargo: EngagementCargoMetric): string {
  if (!cargo.elegiveis) return t('model.cargoAction.notReached');
  const gaps = [
    { count: cargo.elegiveis - cargo.ativados, chave: 'model.cargoAction.gapActivation' },
    { count: cargo.ativados - cargo.consumiram, chave: 'model.cargoAction.gapConsumption' },
    { count: cargo.consumiram - cargo.evidencias, chave: 'model.cargoAction.gapEvidence' },
  ].sort((a, b) => b.count - a.count);
  const gap = gaps[0];
  if (gap.count > 0) return t(gap.chave, { count: gap.count });
  return cargo.emRisco ? t('model.cargoAction.closedAtRisk') : t('model.cargoAction.recognize');
}

const FORMATOS_COM_ROTULO = ['video', 'audio', 'texto', 'case'];
function formatoPreferidoTexto(t: Traduzir, items: any[]): string {
  const best = [...(items || [])].filter((item) => item?.principal > 0)
    .sort((a, b) => b.engajou / b.principal - a.engajou / a.principal || b.engajou - a.engajou)[0];
  if (!best) return t('model.noRecord');
  const rotulo = FORMATOS_COM_ROTULO.includes(best.formato) ? t(`formats.${best.formato}`) : best.formato;
  return t('model.preferredFormat', { format: rotulo, pct: Math.round(best.engajou / best.principal * 100) / 100 });
}

/**
 * Tela e PDF compartilham os mesmos números, bases, grupos e próximas ações.
 *
 * O texto sai no idioma do `t` (namespace `EngagementWorkspace`, R-67): a tela
 * passa o `useTranslations`, o PDF o `createTranslator` do idioma de quem baixa.
 * O modelo não decide idioma: sem `t` ele não monta frase nenhuma.
 */
export function buildViews({ empresaNome, rollup, evolucao, t, locale = 'pt-BR' }: {
  empresaNome: string; rollup: any; evolucao: EngagementEvolutionDashboard | null;
  t: Traduzir; locale?: string;
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
  const explanation = main
    ? t('model.explanation.group', {
      count: counts[main], eligible, week,
      group: t(`model.group.${main}`),
      guidance: main === 'ativacao' ? t('model.explanation.noActivityNote') : blockerMeta(t, main).guidance,
    })
    : eligible ? t('model.explanation.allDone', { count: evidence.count, eligible, week })
      : t('model.explanation.none');

  const people = [...evolucao.pessoasEmRisco].sort((a, b) =>
    Number(b.trajetoria === 'critical') - Number(a.trajetoria === 'critical')
    || a.indiceAtual - b.indiceAtual || a.delta - b.delta || a.nome.localeCompare(b.nome, locale));
  const areaRisk = new Map<string, { total: number; critical: number }>();
  for (const person of people) {
    // O valor cru (inclusive o de reserva) agrupa; o rótulo traduzido só aparece na saída.
    const area = person.area || AREA_SEM_NOME;
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
    || aName.localeCompare(bName, locale));
  const plan = main ? [
    { title: blockerMeta(t, main).action, description: blockerMeta(t, main).guidance, owner: blockerMeta(t, main).owner, deadline: blockerMeta(t, main).deadline },
    {
      title: t('model.plan.agree.title'), description: t('model.plan.agree.description'),
      owner: t('model.plan.agree.owner'), deadline: t('model.plan.agree.deadline'),
    },
    {
      title: t('model.plan.review.title'), description: t('model.plan.review.description'),
      owner: t('model.plan.review.owner'), deadline: t('model.plan.review.deadline'),
    },
  ] : [{
    title: t('model.plan.reviewOthers.title'), description: t('model.plan.reviewOthers.description'),
    owner: t('model.plan.reviewOthers.owner'), deadline: t('model.plan.reviewOthers.deadline'),
  }];

  function view(audience: Audience): ReportView {
    return {
      audience,
      eyebrow: t(`model.eyebrow.${audience}`),
      scope: t(`model.scope.${audience}`, { company: empresaNome }),
      thesis: main ? t('model.thesis.pending', { count: counts[main], kind: t(`model.kind.${main}`) })
        : eligible ? t('model.thesis.completed') : t('model.thesis.none'),
      thesisAccent: main ? blockerMeta(t, main).action : t('model.thesisAccentDefault'),
      explanation, eligible, week, enrolled: evolucao.inscritos, previousEligible: previous?.elegiveis ?? null,
      hasWeeklyData: Boolean(last), canCompare: Boolean(previous && previous.elegiveis > 0 && eligible > 0),
      activation, consumption, evidence,
      risk: { total: evolucao.emRisco, critical: evolucao.trajetorias.critical, attention: evolucao.trajetorias.attention },
      recovered: evolucao.recuperados, tutor: t('model.tutor', { count: last?.usaramTutor || 0, eligible }),
      preferredFormat: formatoPreferidoTexto(t, rollup?.resumo?.porFormato),
      trend: evolucao.semanas.slice(-4).map((w) => ({ label: t('weekShort', { week: w.semana }), activation: w.ativacaoPct, consumption: w.consumoPct, evidence: w.evidenciaPct })),
      cargos: (evolucao.cargos || []).map((cargo) => ({ ...cargo, acao: acaoPorCargo(t, cargo) })),
      priorities: priorityKeys.map((key) => {
        const members = (evolucao.pendenciasSemana || []).filter((person) => person.pendencia === key);
        const byArea = new Map<string, number>();
        for (const person of members) byArea.set(person.area, (byArea.get(person.area) || 0) + 1);
        return {
          key, ...blockerMeta(t, key), count: counts[key], pct: eligible ? Math.round(counts[key] / eligible * 100) : 0,
          members: audience === 'gestor'
            ? members.map((person) => ({
              name: person.nome,
              context: [person.cargo ? rotuloCargo(t, person.cargo) : '', person.area ? rotuloArea(t, person.area) : ''].filter(Boolean).join(' · '),
              id: person.colaboradorId, week,
            }))
            : [...byArea].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({
              name: rotuloArea(t, name), context: t('model.members.areaContext', { count, week }),
            })),
        };
      }),
      actionPlan: audience === 'rh' ? plan.map((action, index) => index === 1 ? {
        title: t('model.plan.alignAreas.title'), description: t('model.plan.alignAreas.description'),
        owner: t('model.plan.alignAreas.owner'), deadline: t('model.plan.alignAreas.deadline'),
      } : action) : plan,
      focusTitle: t(audience === 'gestor' ? 'model.focus.titlePeople' : 'model.focus.titleAreas'),
      focusSubtitle: t('model.focus.subtitle', {
        enrolled: evolucao.inscritos,
        rule: t(audience === 'gestor' ? 'model.focus.rulePeople' : 'model.focus.ruleAreas'),
      }),
      focusItems: audience === 'gestor' ? people.slice(0, 3).map((person) => ({
        name: person.nome,
        context: [person.cargo ? rotuloCargo(t, person.cargo) : '', person.area ? rotuloArea(t, person.area) : '', t('model.week', { week: person.semanaAtual })].filter(Boolean).join(' · '),
        reason: motivoDeRisco(t, person), signal: person.trajetoria === 'critical' ? 'critical' : 'attention',
        label: t(person.trajetoria === 'critical' ? 'model.signal.critical' : 'model.signal.attention'),
        id: person.colaboradorId, week: person.semanaAtual,
      })) : areas.slice(0, 3).map(([area, risk]) => {
        const total = areaTotals.get(area) || 0;
        return {
          name: rotuloArea(t, area),
          context: total
            ? t('model.focus.areaContext', { risk: risk.total, total, pct: Math.round(risk.total / total * 100) / 100 })
            : t('model.focus.areaContextNoBase', { risk: risk.total }),
          reason: t('model.focus.areaReason', { critical: risk.critical, attention: risk.total - risk.critical }),
          signal: risk.critical ? 'critical' : 'attention',
          label: t(risk.critical ? 'model.signal.criticalTrajectories' : 'model.signal.attention'),
        };
      }),
    };
  }
  return { gestor: view('gestor'), rh: view('rh') };
}
