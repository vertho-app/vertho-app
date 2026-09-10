import { consumiuConteudo } from '@/lib/season-engine/consumo-conteudo';
import type { EngagementBlocker } from '@/lib/engajamento/prioridades';
export interface EngagementEnrollment {
  colaboradorId: string;
  nome: string;
  cargo: string;
  area: string;
  semanaAtual: number;
}

export interface EngagementEvent {
  colaboradorId: string;
  semana: number | null;
  tipo: string | null;
}

export interface EngagementVideo {
  colaboradorId: string;
  semana: number | null;
  eventType: string | null;
}

export interface EngagementProgress {
  colaboradorId: string;
  semana: number | null;
  tipo: string | null;
  status: string | null;
  conteudoConsumido: unknown;
}

export interface EngagementTutorUse {
  colaboradorId: string;
  semana: number | null;
}

export interface EngagementWeekMetric {
  semana: number;
  elegiveis: number;
  ativados: number;
  consumiram: number;
  evidencias: number;
  usaramTutor: number;
  ativacaoPct: number;
  consumoPct: number;
  evidenciaPct: number;
  tutorPct: number;
  indiceEvolucao: number;
}

export interface EngagementAreaMetric {
  area: string;
  participantes: number;
  emRisco: number;
  semanas: Array<{ semana: number; indice: number | null; elegiveis: number }>;
  tendencia: number | null;
}

export interface EngagementCargoMetric extends Pick<EngagementWeekMetric,
  'elegiveis' | 'ativados' | 'consumiram' | 'evidencias' | 'ativacaoPct' | 'consumoPct' | 'evidenciaPct'> {
  cargo: string;
  participantes: number;
  emRisco: number;
  criticos: number;
  atencao: number;
  riscoPct: number;
}

export type EngagementTrajectory = 'accelerating' | 'on_track' | 'attention' | 'critical';

export interface EngagementRiskPerson {
  colaboradorId: string;
  nome: string;
  cargo: string;
  area: string;
  semanaAtual: number;
  indiceAtual: number;
  delta: number;
  trajetoria: EngagementTrajectory;
  motivo: string;
}

export interface EngagementEvolutionDashboard {
  areaSelecionada: string | null;
  areasDisponiveis: string[];
  inscritos: number;
  semanaAtual: number;
  semanas: EngagementWeekMetric[];
  areas: EngagementAreaMetric[];
  cargos: EngagementCargoMetric[];
  trajetorias: Record<EngagementTrajectory, number>;
  recuperados: number;
  emRisco: number;
  pessoasEmRisco: EngagementRiskPerson[];
  /** Grupo exato do último fechamento; não mistura pessoas de semanas anteriores. */
  pendenciasSemana?: Array<EngagementEnrollment & { pendencia: EngagementBlocker }>;
}

interface PersonWeekState {
  activated: boolean;
  consumed: boolean;
  evidence: boolean;
  tutor: boolean;
  score: number;
}

const EMPTY_STATE: PersonWeekState = {
  activated: false,
  consumed: false,
  evidence: false,
  tutor: false,
  score: 0,
};

function key(colaboradorId: string, semana: number): string {
  return `${colaboradorId}:${semana}`;
}

function pct(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

/** Régua ÚNICA — ver `lib/season-engine/consumo-conteudo` (era a 2ª de seis cópias). */
const consumedFlag = consumiuConteudo;

function scoreState(state: Omit<PersonWeekState, 'score'>): number {
  return (state.activated ? 20 : 0)
    + (state.consumed ? 30 : 0)
    + (state.evidence ? 40 : 0)
    + (state.tutor ? 10 : 0);
}

function trajectory(current: number, previous: number, hasPrevious: boolean): EngagementTrajectory {
  if (current === 0 && (!hasPrevious || previous === 0)) return 'critical';
  if (hasPrevious && (current - previous >= 20 || (current >= 70 && previous < 70))) {
    return 'accelerating';
  }
  if (current === 0 || current < 40 || (hasPrevious && current < previous)) return 'attention';
  return 'on_track';
}

function riskReason(
  current: PersonWeekState,
  previous: PersonWeekState,
  currentScore: number,
  previousScore: number,
  currentTrajectory: EngagementTrajectory,
  hasPrevious: boolean,
): string {
  if (currentTrajectory === 'critical') return hasPrevious ? 'Sem atividade há duas semanas' : 'Sem atividade na primeira semana';
  if (!current.activated) return 'Sem atividade nesta semana';
  if (currentScore < previousScore) return `Queda de ${previousScore - currentScore} pontos`;
  if (!current.consumed) return 'Consumo incompleto';
  if (!current.evidence) return 'Ainda sem evidência prática';
  if (previous.activated && !current.activated) return 'Interrompeu a sequência';
  return 'Ritmo abaixo do esperado';
}

export function buildEngagementEvolutionDashboard(input: {
  enrollments: EngagementEnrollment[];
  events: EngagementEvent[];
  videos: EngagementVideo[];
  progress: EngagementProgress[];
  tutorUses: EngagementTutorUse[];
  completedStatus: string;
  area?: string | null;
}): EngagementEvolutionDashboard {
  const allEnrollments = input.enrollments.map((enrollment) => ({
    ...enrollment,
    cargo: enrollment.cargo.trim().replace(/\s+/g, ' ') || 'Cargo não informado',
    area: enrollment.area.trim() || 'Sem área',
    semanaAtual: Math.max(1, Math.floor(enrollment.semanaAtual || 1)),
  }));
  const areasDisponiveis = [...new Set(allEnrollments.map((enrollment) => enrollment.area))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const selectedArea = input.area && areasDisponiveis.includes(input.area) ? input.area : null;
  const enrollments = selectedArea
    ? allEnrollments.filter((enrollment) => enrollment.area === selectedArea)
    : allEnrollments;
  if (!enrollments.length) {
    return {
      areaSelecionada: selectedArea,
      areasDisponiveis,
      inscritos: 0,
      semanaAtual: 0,
      semanas: [],
      areas: [],
      cargos: [],
      trajetorias: { accelerating: 0, on_track: 0, attention: 0, critical: 0 },
      recuperados: 0,
      emRisco: 0,
      pessoasEmRisco: [],
    };
  }
  const selectedIds = new Set(enrollments.map((enrollment) => enrollment.colaboradorId));
  const maxWeek = Math.max(1, ...enrollments.map((enrollment) => enrollment.semanaAtual));

  const mutableStates = new Map<string, Omit<PersonWeekState, 'score'>>();
  const getMutable = (colaboradorId: string, semana: number) => {
    const stateKey = key(colaboradorId, semana);
    const existing = mutableStates.get(stateKey);
    if (existing) return existing;
    const created = { activated: false, consumed: false, evidence: false, tutor: false };
    mutableStates.set(stateKey, created);
    return created;
  };

  for (const event of input.events) {
    const week = Number(event.semana);
    if (!selectedIds.has(event.colaboradorId) || !Number.isFinite(week) || week < 1) continue;
    // Chegada pelo canal e tentativa em semana trancada não são ativação.
    if (!['abertura', 'formato', 'audio_fim'].includes(event.tipo || '')) continue;
    const state = getMutable(event.colaboradorId, week);
    state.activated = true;
    if (event.tipo === 'audio_fim') state.consumed = true;
  }
  for (const video of input.videos) {
    const week = Number(video.semana);
    if (!selectedIds.has(video.colaboradorId) || !Number.isFinite(week) || week < 1) continue;
    const state = getMutable(video.colaboradorId, week);
    state.activated = true;
    if (video.eventType === 'play_finished') state.consumed = true;
  }
  for (const progress of input.progress) {
    const week = Number(progress.semana);
    if (!selectedIds.has(progress.colaboradorId) || !Number.isFinite(week) || week < 1) continue;
    const state = getMutable(progress.colaboradorId, week);
    if (consumedFlag(progress.conteudoConsumido)) {
      state.activated = true;
      state.consumed = true;
    }
    // Semana de APLICAÇÃO concluída também é evidência (relato da missão) — sem
    // ela as semanas 4/8/12 zeravam ativação/consumo/evidência na página B.
    if ((progress.tipo === 'conteudo' || progress.tipo === 'aplicacao') && progress.status === input.completedStatus) {
      state.activated = true;
      state.consumed = true;
      state.evidence = true;
    }
  }
  for (const tutorUse of input.tutorUses) {
    const week = Number(tutorUse.semana);
    if (!selectedIds.has(tutorUse.colaboradorId) || !Number.isFinite(week) || week < 1) continue;
    const state = getMutable(tutorUse.colaboradorId, week);
    state.activated = true;
    state.tutor = true;
  }

  const stateFor = (colaboradorId: string, semana: number): PersonWeekState => {
    const state = mutableStates.get(key(colaboradorId, semana));
    if (!state) return EMPTY_STATE;
    return { ...state, score: scoreState(state) };
  };

  const weeks: EngagementWeekMetric[] = Array.from({ length: maxWeek }, (_, index) => {
    const semana = index + 1;
    const eligible = enrollments.filter((enrollment) => enrollment.semanaAtual >= semana);
    const states = eligible.map((enrollment) => stateFor(enrollment.colaboradorId, semana));
    const activated = states.filter((state) => state.activated).length;
    const consumed = states.filter((state) => state.consumed).length;
    const evidence = states.filter((state) => state.evidence).length;
    const tutor = states.filter((state) => state.tutor).length;
    const score = states.reduce((sum, state) => sum + state.score, 0);
    return {
      semana,
      elegiveis: eligible.length,
      ativados: activated,
      consumiram: consumed,
      evidencias: evidence,
      usaramTutor: tutor,
      ativacaoPct: pct(activated, eligible.length),
      consumoPct: pct(consumed, eligible.length),
      evidenciaPct: pct(evidence, eligible.length),
      tutorPct: pct(tutor, eligible.length),
      indiceEvolucao: eligible.length ? Math.round(score / eligible.length) : 0,
    };
  });

  const heatmapAreas = [...new Set(enrollments.map((enrollment) => enrollment.area))]
    .map((area): EngagementAreaMetric => {
      const areaEnrollments = enrollments.filter((enrollment) => enrollment.area === area);
      const areaWeeks = weeks.map(({ semana }) => {
        const eligible = areaEnrollments.filter((enrollment) => enrollment.semanaAtual >= semana);
        if (!eligible.length) return { semana, indice: null, elegiveis: 0 };
        const total = eligible.reduce(
          (sum, enrollment) => sum + stateFor(enrollment.colaboradorId, semana).score,
          0,
        );
        return { semana, indice: Math.round(total / eligible.length), elegiveis: eligible.length };
      });
      const populated = areaWeeks.filter((week) => week.indice != null);
      const current = populated.at(-1)?.indice ?? null;
      const previous = populated.at(-2)?.indice ?? null;
      return {
        area,
        participantes: areaEnrollments.length,
        emRisco: 0,
        semanas: areaWeeks,
        tendencia: current != null && previous != null ? current - previous : null,
      };
    })
    .sort((a, b) => b.participantes - a.participantes || a.area.localeCompare(b.area, 'pt-BR'));

  const trajectories: Record<EngagementTrajectory, number> = {
    accelerating: 0,
    on_track: 0,
    attention: 0,
    critical: 0,
  };
  let recovered = 0;
  const riskPeople: EngagementRiskPerson[] = [];
  const cargos = new Map<string, EngagementCargoMetric>();

  for (const enrollment of enrollments) {
    const participantWeek = enrollment.semanaAtual;
    const previousWeek = Math.max(1, participantWeek - 1);
    const hasPrevious = participantWeek > 1;
    const current = stateFor(enrollment.colaboradorId, participantWeek);
    const previous = hasPrevious
      ? stateFor(enrollment.colaboradorId, previousWeek)
      : EMPTY_STATE;
    const currentTrajectory = trajectory(current.score, previous.score, hasPrevious);
    trajectories[currentTrajectory] += 1;
    const cargoKey = enrollment.cargo.toLocaleLowerCase('pt-BR');
    let cargo = cargos.get(cargoKey);
    if (!cargo) {
      cargo = {
        cargo: enrollment.cargo, participantes: 0, elegiveis: 0,
        ativados: 0, consumiram: 0, evidencias: 0,
        ativacaoPct: 0, consumoPct: 0, evidenciaPct: 0,
        emRisco: 0, criticos: 0, atencao: 0, riscoPct: 0,
      };
      cargos.set(cargoKey, cargo);
    }
    cargo.participantes += 1;
    // Fechamento por cargo usa a mesma semana/base dos indicadores gerais.
    // Risco considera a semana individual de TODOS os inscritos, antes do top 20.
    if (participantWeek >= maxWeek) {
      cargo.elegiveis += 1;
      cargo.ativados += Number(current.activated);
      cargo.consumiram += Number(current.consumed);
      cargo.evidencias += Number(current.evidence);
    }
    if (currentTrajectory === 'critical') cargo.criticos += 1;
    if (currentTrajectory === 'attention') cargo.atencao += 1;
    if (hasPrevious && previous.score === 0 && current.score > 0) recovered += 1;
    if (currentTrajectory === 'attention' || currentTrajectory === 'critical') {
      riskPeople.push({
        colaboradorId: enrollment.colaboradorId,
        nome: enrollment.nome,
        cargo: enrollment.cargo,
        area: enrollment.area,
        semanaAtual: participantWeek,
        indiceAtual: current.score,
        delta: current.score - previous.score,
        trajetoria: currentTrajectory,
        motivo: riskReason(
          current,
          previous,
          current.score,
          previous.score,
          currentTrajectory,
          hasPrevious,
        ),
      });
    }
  }

  riskPeople.sort((a, b) => (
    Number(a.trajetoria !== 'critical') - Number(b.trajetoria !== 'critical')
    || a.indiceAtual - b.indiceAtual
    || a.nome.localeCompare(b.nome, 'pt-BR')
  ));

  for (const area of heatmapAreas) {
    area.emRisco = riskPeople.filter((person) => person.area === area.area).length;
  }
  const cargoMetrics = [...cargos.values()].map((cargo) => ({
    ...cargo,
    ativacaoPct: pct(cargo.ativados, cargo.elegiveis),
    consumoPct: pct(cargo.consumiram, cargo.elegiveis),
    evidenciaPct: pct(cargo.evidencias, cargo.elegiveis),
    emRisco: cargo.criticos + cargo.atencao,
    riscoPct: pct(cargo.criticos + cargo.atencao, cargo.participantes),
  })).sort((a, b) => b.emRisco - a.emRisco || b.criticos - a.criticos
    || b.participantes - a.participantes || a.cargo.localeCompare(b.cargo, 'pt-BR'));

  return {
    areaSelecionada: selectedArea,
    areasDisponiveis,
    inscritos: enrollments.length,
    semanaAtual: maxWeek,
    semanas: weeks,
    areas: heatmapAreas,
    cargos: cargoMetrics,
    trajetorias: trajectories,
    recuperados: recovered,
    emRisco: trajectories.attention + trajectories.critical,
    pessoasEmRisco: riskPeople,
    pendenciasSemana: enrollments.filter((person) => person.semanaAtual >= maxWeek).flatMap((person) => {
      const state = stateFor(person.colaboradorId, maxWeek);
      if (state.evidence) return [];
      const pendencia: EngagementBlocker = !state.activated ? 'ativacao' : !state.consumed ? 'consumo' : 'evidencia';
      return [{ ...person, pendencia }];
    }),
  };
}
