/**
 * Tipos e constantes do FLUXO COMPLETO (IA4 → competência de cada pessoa → blueprint → auditoria → PDI → trilha → Gestor/RH) executado no
 * servidor por uma task do Trigger.dev. O estado vive em `ia_jobs` (`fase = 'fluxo'`): `params` descreve o pedido e
 * `progress` é a fonte da tela de acompanhamento.
 */
import type { EtapaId } from './previa';

export type { EtapaId };

/** Ordem de execução. A competência de cada pessoa sai das notas da IA4 e decide o blueprint, o PDI e a trilha, então vem entre eles; a auditoria depende do blueprint; Gestor e RH vêm depois do PDI; a trilha depois do blueprint; o kit lê o plano da trilha, então vem depois dela; a trilha exige a biblioteca de conteúdo-base, então os conteúdos vêm antes dela. */
export const ORDEM_ETAPAS: EtapaId[] = ['ia4', 'foco', 'blueprint', 'auditoria', 'pdi', 'conteudo', 'trilha', 'kit', 'gestor', 'rh'];

/** Uma escolha da etapa "Competência de cada pessoa", para a tela mostrar quem ficou com o quê e por quê. */
export interface FocoDefinido {
  colaboradorId: string;
  nome: string;
  cargo: string | null;
  competencia: string;
  media: number;
  criterio: string;
  empatadas: string[];
}

export const FASE_FLUXO = 'fluxo';
export const TASK_FLUXO = 'fluxo-completo';

export type EstadoEtapa = 'aguardando' | 'rodando' | 'ok' | 'parcial' | 'erro' | 'pulado';

export interface ProgressoEtapa {
  id: EtapaId;
  titulo: string;
  estado: EstadoEtapa;
  /** Itens que a etapa tomou para fazer (acumulado entre execuções). */
  total: number;
  feitos: number;
  falhas: number;
  /** `ia_jobs` filhos (lotes de IA4, blueprint e PDI), para acompanhar e cancelar. */
  jobIds: string[];
  detalhe?: string;
}

export interface ProgressoFluxo {
  etapas: ProgressoEtapa[];
  /** Texto curto do que está acontecendo agora (a tela mostra). */
  atual: string;
  /** Modelos efetivamente usados por etapa (impressos: config declarada não é config aplicada). */
  modelos?: Record<string, string>;
  /** Pessoas que entraram na fila do blueprint NESTA rodada: só elas são auditadas (não se reavalia o passado). */
  blueprintAlvo?: string[];
  /** Competências escolhidas pela etapa "Competência de cada pessoa" nesta rodada (na simulação, as que SERIAM). */
  focoDefinido?: FocoDefinido[];
  /** Quantas execuções da task já houve (a task se re-agenda quando acaba o orçamento de tempo). */
  execucoes: number;
  dryRun?: boolean;
  resumo?: string;
}

export interface EscopoFluxo {
  turmaId?: string | null;
  empresaInteiraJustificativa?: string | null;
  cargos?: string[] | null;
}

export interface ParamsFluxo {
  empresaId: string;
  escopo: EscopoFluxo;
  /** Ids do escopo resolvido NO INÍCIO (`null` = empresa inteira, sem restrição de turma). */
  permitidos: string[] | null;
  /** Simulação: lê as filas e escreve o progresso, mas NÃO enfileira, gera nem audita nada. */
  dryRun?: boolean;
  /** Restringe a estas etapas (teste); ausente = todas. */
  somente?: EtapaId[];
  criadoPor?: string | null;
  /**
   * Contas internas (`@vertho.ai`) que ESTE pedido inclui, por id. O padrão é excluí-las (não entram em estatística nem em
   * fluxo). Só o script/servidor grava isto: `iniciarFluxoCompleto` não aceita o campo do cliente. Fica no `ia_jobs.params`,
   * então todo fluxo que abriu a exceção deixa o rastro de quem foi incluído.
   */
  excecaoInternos?: string[];
  /**
   * Limita o KIT às primeiras N semanas da trilha (ex.: piloto de uma pessoa: `1`). A TRILHA e a biblioteca de conteúdo-base
   * seguem completas (a trilha monta todas as semanas e exige conteúdo para cada uma); o que se poupa é o Kit (e o vídeo),
   * que são os itens caros. Ausente = o horizonte inteiro, como o botão da coorte.
   */
  kitSemanaMax?: number;
}

export const TITULOS_ETAPA: Record<EtapaId, string> = {
  ia4: 'IA4 — avaliar respostas + check',
  foco: 'Competência de cada pessoa (menor nota)',
  blueprint: 'Blueprint',
  auditoria: 'Auditoria do blueprint',
  pdi: 'PDI',
  conteudo: 'Conteúdos (biblioteca da trilha)',
  trilha: 'Trilha (temporada)',
  kit: 'Kit semanal (conteúdos por DISC)',
  gestor: 'Relatório do Gestor',
  rh: 'Relatório do RH',
};

const etapaNova = (id: EtapaId): ProgressoEtapa => ({ id, titulo: TITULOS_ETAPA[id], estado: 'aguardando', total: 0, feitos: 0, falhas: 0, jobIds: [] });

/**
 * As etapas de um progresso GRAVADO, completadas com as que nasceram depois dele, na ordem de execução. Um fluxo criado
 * antes de uma etapa nova existir (a "Competência de cada pessoa" entrou em 15/10/2026) e continuado depois (a task se
 * re-agenda sozinha) não a tem, e o executor procura toda etapa da ordem: sem isto, a continuação quebrava.
 */
export function etapasCompletas(gravadas: ProgressoEtapa[]): ProgressoEtapa[] {
  const porId = new Map(gravadas.map((e) => [e.id, e]));
  return ORDEM_ETAPAS.map((id) => porId.get(id) ?? etapaNova(id));
}

export function progressoInicial(dryRun = false): ProgressoFluxo {
  return {
    etapas: ORDEM_ETAPAS.map(etapaNova),
    atual: 'na fila',
    execucoes: 0,
    dryRun,
  };
}
