import { consumiuConteudo } from '@/lib/season-engine/consumo-conteudo';
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
  semanas: Array<{ semana: number; indice: number | null; elegiveis: number }>;
  tendencia: number | null;
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
  trajetorias: Record<EngagementTrajectory, number>;
  recuperados: number;
  emRisco: number;
  pessoasEmRisco: EngagementRiskPerson[];
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
): string {
  if (currentTrajectory === 'critical') return 'Sem atividade há duas semanas';
  if (!current.activated) return 'Sem atividade nesta semana';
  if (currentScore < previousScore) return `Queda de ${previousScore - currentScore} pontos`;
  if (!current.evidence) return 'Ainda sem evidência prática';
  if (!current.consumed) return 'Consumo incompleto';
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
        ),
      });
    }
  }

  riskPeople.sort((a, b) => (
    Number(a.trajetoria !== 'critical') - Number(b.trajetoria !== 'critical')
    || a.indiceAtual - b.indiceAtual
    || a.nome.localeCompare(b.nome, 'pt-BR')
  ));

  return {
    areaSelecionada: selectedArea,
    areasDisponiveis,
    inscritos: enrollments.length,
    semanaAtual: maxWeek,
    semanas: weeks,
    areas: heatmapAreas,
    trajetorias: trajectories,
    recuperados: recovered,
    emRisco: trajectories.attention + trajectories.critical,
    pessoasEmRisco: riskPeople.slice(0, 20),
  };
}
