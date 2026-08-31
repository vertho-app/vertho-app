/**
 * Normalização dos relatórios narrativos para as telas analíticas.
 *
 * Relatórios antigos e novos convivem no banco e alguns campos já mudaram de
 * nome ao longo do tempo. O dashboard não deve conhecer essas variações: ele
 * recebe uma estrutura pequena, previsível e sem `any` escapando para a UI.
 */

import type { DnaAggregate, Dist } from '@/lib/dna-organizacional/aggregate';

export type ExecutiveReading = {
  reading: string | null;
  strength: string | null;
  risk: string | null;
};

export type RhRoleReading = {
  role: string;
  average: number | null;
  reading: string | null;
  strengths: string[];
  risks: string[];
};

export type RhDescriptorLevel = {
  level: 1 | 2 | 3 | 4;
  percentage: number;
};

export type RhDescriptorReading = {
  descriptor: string;
  average: number;
  evaluated: number;
  levels: RhDescriptorLevel[];
};

export type RhCompetencyDescriptorReading = {
  competency: string;
  average: number;
  priority: boolean;
  levels: RhDescriptorLevel[];
  descriptors: RhDescriptorReading[];
  strength: { descriptor: string; percentage: number } | null;
  opportunity: { descriptor: string; percentage: number } | null;
};

export type RhDescriptorScope = {
  role: string | null;
  evaluated: number;
  competencies: RhCompetencyDescriptorReading[];
};

export type RhDescriptorAnalysis = {
  organization: RhDescriptorScope;
  roles: RhDescriptorScope[];
};

export type RhRoleFocus = {
  role: string;
  competency: string;
  horizon: string | null;
  rationale: string | null;
  impact: string | null;
};

export type RhCriticalCompetency = {
  competency: string;
  criticality: string | null;
  rationale: string | null;
  impact: string | null;
  training: {
    title: string;
    audience: string | null;
    format: string | null;
    workload: string | null;
  } | null;
};

export type RhTalentDecision = {
  person: string;
  situation: string | null;
  action: string | null;
  reviewCriterion: string | null;
};

export type RhReportInsight = {
  executive: ExecutiveReading;
  indicators: {
    evaluated: number | null;
    assessments: number | null;
    average: number | null;
    levels: Array<{ level: 1 | 2 | 3 | 4; percentage: number }>;
  };
  comparison: {
    analysis: string | null;
    positive: string | null;
    attention: string | null;
  };
  roles: RhRoleReading[];
  roleFocus: RhRoleFocus[];
  criticalCompetencies: RhCriticalCompetency[];
  organizationalProfile: {
    description: string | null;
    strength: string | null;
    risk: string | null;
  };
  talents: RhTalentDecision[];
  actionPlan: {
    shortTerm: string[];
    mediumTerm: string[];
    longTerm: string[];
  };
};

export type ManagerCompetencyReading = {
  competency: string;
  average: number | null;
  distribution: Array<{ level: 1 | 2 | 3 | 4; people: number }>;
  pattern: string | null;
  managerAction: string | null;
  risk: string | null;
};

export type ManagerPersonSignal = {
  person: string;
  competency: string | null;
  level: number | null;
  reason: string | null;
  urgency: string | null;
  risk: string | null;
};

export type ManagerReportInsight = {
  executive: ExecutiveReading;
  competencies: ManagerCompetencyReading[];
  highlights: ManagerPersonSignal[];
  attention: ManagerPersonSignal[];
  teamProfile: {
    description: string | null;
    strength: string | null;
    risk: string | null;
  };
  actions: {
    primary: string | null;
    thisWeek: string[];
    nextWeeks: string[];
    mediumTerm: string[];
  };
  managerCadence: {
    weekly: string | null;
    biweekly: string | null;
    nextCycle: string | null;
  };
};

function asObject(value: unknown): Record<string, any> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asText).filter((item): item is string => Boolean(item));
  const direct = asText(value);
  return direct ? [direct] : [];
}

function asActionList(value: unknown): string[] {
  if (Array.isArray(value)) return asStringList(value);
  const source = asObject(value);
  return [source.titulo, source.descricao, source.impacto]
    .map(asText)
    .filter((item): item is string => Boolean(item));
}

function descriptorLevels(dist: Dist): RhDescriptorLevel[] {
  return ([1, 2, 3, 4] as const).map((level) => ({
    level,
    percentage: Math.max(0, Math.min(100, asNumber(dist[`n${level}` as keyof Dist]) ?? 0)),
  }));
}

function descriptorScope(dna: DnaAggregate, role: string | null): RhDescriptorScope {
  return {
    role,
    evaluated: Math.max(0, dna.avaliados),
    competencies: dna.competencias.map((competency) => ({
      competency: competency.nome,
      average: competency.media,
      priority: competency.prioridade,
      levels: descriptorLevels(competency.pct),
      descriptors: competency.descritores.map((descriptor) => ({
        descriptor: descriptor.descritor,
        average: descriptor.media,
        evaluated: descriptor.totalColabs,
        levels: descriptorLevels(descriptor.pct),
      })),
      strength: competency.forca
        ? { descriptor: competency.forca.descritor, percentage: competency.forca.nivelPct }
        : null,
      opportunity: competency.oportunidade
        ? { descriptor: competency.oportunidade.descritor, percentage: competency.oportunidade.n1pct }
        : null,
    })),
  };
}

/**
 * Recorta o DNA coletivo para a interface do RH. O agregado não carrega nomes:
 * a tela recebe apenas distribuições anônimas e os cargos que passaram pelo
 * piso de privacidade do próprio DNA (três pessoas avaliadas).
 */
export function normalizeRhDescriptorAnalysis(dna: DnaAggregate | null | undefined): RhDescriptorAnalysis | null {
  if (!dna || dna.semDados || dna.competencias.length === 0) return null;
  return {
    organization: descriptorScope(dna, null),
    roles: (dna.porCargo || [])
      .filter((group) => !group.dna.semDados && group.dna.competencias.length > 0)
      .map((group) => descriptorScope(group.dna, group.cargo)),
  };
}

function normalizeExecutive(value: unknown, kind: 'rh' | 'manager'): ExecutiveReading {
  const source = asObject(value);
  return {
    reading: asText(source.leitura_geral ?? source.leitura),
    strength: asText(kind === 'rh'
      ? source.principal_forca_organizacional ?? source.principal_avanco
      : source.principal_avanco ?? source.principal_forca_organizacional),
    risk: asText(kind === 'rh'
      ? source.principal_risco_organizacional ?? source.principal_ponto_de_atencao
      : source.principal_ponto_de_atencao ?? source.principal_risco_organizacional),
  };
}

export function normalizeRhReportInsight(value: unknown): RhReportInsight | null {
  const content = asObject(value);
  if (Object.keys(content).length === 0) return null;

  const indicators = asObject(content.indicadores);
  const trainings = new Map<string, any>();
  for (const training of asArray(content.treinamentos_sugeridos)) {
    const key = asText(training?.competencia)?.toLocaleLowerCase();
    if (key && !trainings.has(key)) trainings.set(key, training);
  }

  return {
    executive: normalizeExecutive(content.resumo_executivo, 'rh'),
    indicators: {
      evaluated: asNumber(indicators.total_avaliados),
      assessments: asNumber(indicators.total_avaliacoes),
      average: asNumber(indicators.media_geral),
      levels: ([1, 2, 3, 4] as const).map((level) => ({
        level,
        percentage: Math.max(0, Math.min(100, asNumber(indicators[`pct_nivel_${level}`]) ?? 0)),
      })),
    },
    comparison: {
      analysis: asText(content.comparativo_f1_f3?.analise),
      positive: asText(content.comparativo_f1_f3?.destaque_positivo),
      attention: asText(content.comparativo_f1_f3?.destaque_atencao),
    },
    roles: asArray(content.visao_por_cargo).map((item) => ({
      role: asText(item?.cargo) || '—',
      average: asNumber(item?.media_nivel ?? item?.media),
      reading: asText(item?.leitura ?? item?.analise),
      strengths: asStringList(item?.principais_forcas ?? item?.ponto_forte),
      risks: asStringList(item?.principais_riscos ?? item?.ponto_critico),
    })),
    roleFocus: asArray(content.competencia_foco_por_cargo).map((item) => ({
      role: asText(item?.cargo) || '—',
      competency: asText(item?.competencia_recomendada) || '—',
      horizon: asText(item?.horizonte_sugerido),
      rationale: asText(item?.justificativa),
      impact: asText(item?.expectativa_impacto),
    })),
    criticalCompetencies: asArray(content.competencias_criticas).map((item) => {
      const competency = asText(item?.competencia) || '—';
      const training = trainings.get(competency.toLocaleLowerCase());
      return {
        competency,
        criticality: asText(item?.criticidade),
        rationale: asText(item?.justificativa ?? item?.motivo),
        impact: asText(item?.impacto_organizacional ?? item?.impacto ?? item?.impacto_alunos),
        training: training ? {
          title: asText(training.titulo) || '—',
          audience: asText(training.publico),
          format: asText(training.formato),
          workload: asText(training.carga_horaria),
        } : null,
      };
    }),
    organizationalProfile: {
      description: asText(content.perfil_disc_organizacional?.descricao),
      strength: asText(content.perfil_disc_organizacional?.forca_coletiva),
      risk: asText(content.perfil_disc_organizacional?.risco_coletivo),
    },
    talents: asArray(content.decisoes_chave).map((item) => ({
      person: asText(item?.colaborador) || '—',
      situation: asText(item?.situacao),
      action: asText(item?.acao ?? item?.acao_imediata),
      reviewCriterion: asText(item?.criterio_reavaliacao),
    })),
    actionPlan: {
      shortTerm: asActionList(content.plano_acao?.curto_prazo),
      mediumTerm: asActionList(content.plano_acao?.medio_prazo),
      longTerm: asActionList(content.plano_acao?.longo_prazo),
    },
  };
}

function normalizePersonSignal(value: any, attention = false): ManagerPersonSignal {
  return {
    person: asText(value?.nome ?? value?.colaborador) || '—',
    competency: asText(value?.competencia),
    level: asNumber(value?.nivel),
    reason: asText(attention ? value?.motivo : value?.motivo_destaque ?? value?.motivo),
    urgency: asText(value?.urgencia),
    risk: asText(value?.risco_se_nao_agir ?? value?.risco),
  };
}

export function normalizeManagerReportInsight(value: unknown): ManagerReportInsight | null {
  const content = asObject(value);
  if (Object.keys(content).length === 0) return null;

  return {
    executive: normalizeExecutive(content.resumo_executivo, 'manager'),
    competencies: asArray(content.analise_por_competencia).map((item) => {
      const distribution = asObject(item?.distribuicao);
      return {
        competency: asText(item?.competencia) || '—',
        average: asNumber(item?.media_nivel ?? item?.media),
        distribution: ([1, 2, 3, 4] as const).map((level) => ({
          level,
          people: Math.max(0, asNumber(distribution[`n${level}`]) ?? 0),
        })),
        pattern: asText(item?.padrao_observado ?? item?.leitura),
        managerAction: asText(item?.acao_gestor ?? item?.acao),
        risk: asText(item?.impacto_se_nao_agir ?? item?.impacto),
      };
    }),
    highlights: asArray(content.destaques_evolucao).map((item) => normalizePersonSignal(item)),
    attention: asArray(content.ranking_atencao).map((item) => normalizePersonSignal(item, true)),
    teamProfile: {
      description: asText(content.perfil_disc_equipe?.descricao),
      strength: asText(content.perfil_disc_equipe?.forca_coletiva),
      risk: asText(content.perfil_disc_equipe?.risco_coletivo),
    },
    actions: {
      primary: asText(content.acoes?.acao_principal),
      thisWeek: asStringList(content.acoes?.esta_semana),
      nextWeeks: asStringList(content.acoes?.proximas_semanas),
      mediumTerm: asStringList(content.acoes?.medio_prazo),
    },
    managerCadence: {
      weekly: asText(content.papel_do_gestor?.semanal),
      biweekly: asText(content.papel_do_gestor?.quinzenal),
      nextCycle: asText(content.papel_do_gestor?.proximo_ciclo),
    },
  };
}
